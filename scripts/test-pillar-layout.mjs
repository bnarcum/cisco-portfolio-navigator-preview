#!/usr/bin/env node
/** Runs in-browser pillar layout collision check via Playwright. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(
    () => window.__cpnV2?.phases?.pillarLayoutSelfTest,
    { timeout: 60000 }
  );
  await page.evaluate(() => {
    document.querySelector('[data-vm="families"]')?.click();
  });
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => window.__cpnV2.phases.pillarLayoutSelfTest());
  console.log("Pillar layout self-test:", JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error("FAIL: cross-pillar collisions detected");
    process.exit(1);
  }
  console.log("PASS: no cross-pillar collisions");
} finally {
  await browser.close();
}
