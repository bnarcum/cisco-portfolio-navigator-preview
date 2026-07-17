#!/usr/bin/env node
/** Walk — player can move with keyboard/dpad immediately on entering the walk */
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
  await page.waitForFunction(() => window.DesignStudio?.instance?.design?.rooms?.length >= 10, { timeout: 60000 });
  await page.click('#ds-tabs [data-tab="room"]');
  await page.waitForTimeout(400);
  await page.click("#ds-walk-corridor");
  await page.waitForFunction(() => window.__DS_WALK?.isOpen?.(), { timeout: 60000 });
  await page.waitForTimeout(1200);

  const before = await page.evaluate(() => {
    const s = window.__DS_WALK?.debugStats?.() || {};
    return { x: s.pos?.x, z: s.pos?.z, mode: s.mode };
  });
  if (!Number.isFinite(before.x)) errors.push("no player position after entering walk");

  await page.keyboard.down("w");
  await page.waitForTimeout(600);
  await page.keyboard.up("w");
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => {
    const s = window.__DS_WALK?.debugStats?.() || {};
    return { x: s.pos?.x, z: s.pos?.z };
  });

  const moved = Math.hypot((after.x || 0) - (before.x || 0), (after.z || 0) - (before.z || 0));
  if (moved < 0.15) errors.push(`player did not move with W key (delta=${moved.toFixed(3)})`);

  const mm = await page.evaluate(() => {
    const canvas = document.getElementById("ds-walk-minimap");
    const ctx = canvas?.getContext("2d");
    if (!ctx) return { ok: false };
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 40 && data[i + 3] > 20) colored++;
    }
    return { ok: colored > 200, colored, w: canvas.width, h: canvas.height };
  });
  if (!mm.ok) errors.push(`minimap appears empty (pixels=${mm.colored})`);

  if (errors.length) {
    console.error("FAIL\n" + errors.map(e => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("Walk movement test OK");
  console.log("  moved:", moved.toFixed(2), "minimap pixels:", mm.colored);
} finally {
  await browser.close();
}
