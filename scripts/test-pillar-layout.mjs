#!/usr/bin/env node
/** Layout regression: collisions, icons inside zones, triple pillar overlap. */
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
  await page.evaluate(() => document.querySelector('[data-vm="families"]')?.click());
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => window.__cpnV2.phases.pillarLayoutSelfTest());
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error("FAIL:", [
      result.crossCollisions && `${result.crossCollisions} cross-pillar collisions`,
      result.withinCollisions && `${result.withinCollisions} within-pillar collisions`,
      result.outsideZone && `${result.outsideZone} icons outside zone`,
      !result.tripleZoneOverlap && "zones do not triple-overlap",
      result.allPillarLabelsOff === false && "labels visible in all-pillars mode",
      result.labelOverlaps && `${result.labelOverlaps} label overlaps when focused`,
      result.focusedLabelCoverage?.some(r => !r.allLabeled) && "missing labels in focused pillar",
    ].filter(Boolean).join("; "));
    process.exit(1);
  }
  console.log("PASS: pillar layout + label strategy OK");
} finally {
  await browser.close();
}
