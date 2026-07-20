#!/usr/bin/env node
/** Pillar focus — promise strip + expanded insight card (V1 peek, default expanded). */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });

  await page.evaluate(() => {
    document.querySelector('[data-vm="families"]')?.click();
    window.applyViewLevel?.("families", { focusPillar: "ai-dc" });
  });
  await page.waitForTimeout(900);

  let state = await page.evaluate(() => ({
    version: window.__cpnV2?.APP_VERSION,
    strip: !!document.querySelector(".pillar-promise-strip"),
    card: !!document.querySelector(".pillar-insight-card"),
    items: document.querySelectorAll(".pic-item").length,
    tab: !!document.querySelector(".pillar-insight-tab"),
    pillarFocus: document.body.classList.contains("pillar-focus")
  }));

  if (state.version !== "3.5.19") errors.push(`expected 3.5.19, got ${state.version}`);
  if (!state.pillarFocus) errors.push("expected pillar-focus body class");
  if (!state.strip) errors.push("missing pillar promise strip");
  if (!state.card) errors.push("missing expanded insight card");
  if (state.items < 3) errors.push(`expected >=3 value props, got ${state.items}`);
  if (state.tab) errors.push("minimized tab should not show when expanded");

  await page.evaluate(() => window.__cpnPillarContextAction("minimize"));
  await page.waitForTimeout(400);

  state = await page.evaluate(() => ({
    card: !!document.querySelector(".pillar-insight-card"),
    tab: !!document.querySelector(".pillar-insight-tab"),
    strip: !!document.querySelector(".pillar-promise-strip")
  }));

  if (state.card) errors.push("insight card should hide when minimized");
  if (!state.tab) errors.push("missing minimize tab");
  if (!state.strip) errors.push("promise strip should remain when minimized");

  await page.evaluate(() => window.__cpnPillarContextAction("restore"));
  await page.waitForTimeout(400);

  const restored = await page.evaluate(() => !!document.querySelector(".pillar-insight-card"));
  if (!restored) errors.push("insight card should restore from tab");

  if (errors.length) {
    console.error("FAIL:", errors.join("; "));
    process.exit(1);
  }
  console.log("PASS: pillar context expanded + minimize/restore");
} finally {
  await browser.close();
}
