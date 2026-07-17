#!/usr/bin/env node
/** Network walk — click device opens educational field panel with content */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8765/cisco-portfolio-navigator.html";
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));

  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.click("#design-studio-btn");
  await page.waitForSelector("#design-studio.open", { timeout: 30000 });
  await page.evaluate(() => document.querySelector("#ds-one-cisco-deck [data-pillar='workplaces']")?.click());
  await page.waitForTimeout(300);
  await page.click("#ds-generate");
  await page.waitForFunction(() => window.DesignStudio?.instance?.design?.rooms?.length >= 10, { timeout: 30000 });

  await page.click('#ds-tabs [data-tab="network"]');
  await page.waitForTimeout(500);
  await page.click("#ds-walk-corridor");
  await page.waitForTimeout(2000);
  await page.waitForFunction(
    () => (window.__DS_WALK?.debugStats?.()?.pods || 0) >= 5,
    { timeout: 45000 }
  );

  const pre = await page.evaluate(() => ({
    walkOpen: window.__DS_WALK?.isOpen?.(),
    pods: window.__DS_WALK?.debugStats?.()?.pods || 0,
    retroBtn: !!document.querySelector('[data-action="mode-retro"]'),
    status: document.getElementById("ds-walk-status")?.textContent || ""
  }));
  if (!pre.walkOpen) errors.push(`walk not open: ${pre.status}`);
  if (pre.pods < 5) errors.push(`expected network pods, got ${pre.pods}`);
  if (pre.retroBtn) errors.push("retro mode button should not exist");

  await page.waitForTimeout(400);

  const clicked = await page.evaluate(() => {
    const studio = window.DesignStudio?.instance;
    const stats = window.__DS_WALK?.debugStats?.();
    if (!stats?.pods) return { ok: false, reason: "no pods" };
    const canvas = document.getElementById("ds-walk-canvas");
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
    return { ok: true };
  });
  if (!clicked.ok) errors.push(clicked.reason);

  await page.waitForTimeout(300);

  const panel = await page.evaluate(() => {
    const el = document.getElementById("ds-field-panel");
    const text = el?.innerText || "";
    return {
      hidden: el?.hidden,
      hasWhatIs: /what is this/i.test(text),
      hasFieldTip: /field tip/i.test(text),
      hasPath: /network path/i.test(text),
      textLen: text.length,
      openClass: document.getElementById("ds-walk-overlay")?.classList.contains("ds-field-panel-open")
    };
  });

  if (panel.hidden !== false) errors.push("field panel not visible after click");
  if (!panel.hasWhatIs) errors.push("panel missing 'What is this?' section");
  if (!panel.hasFieldTip) errors.push("panel missing field tip");
  if (panel.textLen < 80) errors.push(`panel content too short: ${panel.textLen} chars`);

  const navChip = await page.evaluate(() => {
    const chips = [...document.querySelectorAll(".ds-walk-dev")];
    if (!chips.length) return { ok: false };
    chips[2]?.click();
    return { ok: true };
  });
  if (!navChip.ok) errors.push("no nav chips");
  await page.waitForTimeout(200);
  const panel2 = await page.evaluate(() => ({
    hidden: document.getElementById("ds-field-panel")?.hidden,
    len: document.getElementById("ds-field-panel")?.innerText?.length || 0
  }));
  if (panel2.hidden !== false) errors.push("nav chip click did not open panel");
  if (panel2.len < 80) errors.push("nav chip panel content too short");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const afterEsc = await page.evaluate(() => ({
    panelHidden: document.getElementById("ds-field-panel")?.hidden,
    walkOpen: window.__DS_WALK?.isOpen?.()
  }));
  if (!afterEsc.panelHidden) errors.push("Esc should close panel");
  if (!afterEsc.walkOpen) errors.push("Esc should not exit walk mode");

  if (errors.length) {
    console.error("FAIL\n" + errors.map(e => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("Network inspect test OK");
  console.log("  pods:", pre.pods, "panel chars:", panel.textLen);
} finally {
  await browser.close();
}
