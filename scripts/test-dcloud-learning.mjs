#!/usr/bin/env node
/** dCloud learning paths, Labs tab, Learn & Try panel. */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const dcloudJson = JSON.parse(fs.readFileSync(path.join(root, "dcloud-links.json"), "utf8"));

const browser = await chromium.launch();
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(data => { window.__DCLOUD_BOOT = data; }, dcloudJson);
  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });
  await page.waitForFunction(
    () => window.DCLOUD_PATHS?.length > 0 && window.DCLOUD_ENTRIES?.length > 0,
    { timeout: 15000 }
  );

  const version = await page.evaluate(() => window.__cpnV2?.APP_VERSION);
  if (version !== "2.31.25") errors.push(`expected APP_VERSION 2.31.25, got ${version}`);

  const pathCount = await page.evaluate(() => window.DCLOUD_PATHS?.length || 0);
  if (pathCount < 5) errors.push(`expected >=5 learning paths, got ${pathCount}`);

  await page.selectOption("#ucs", "Hybrid Work");
  await page.waitForTimeout(400);
  const bannerVisible = await page.evaluate(() =>
    document.getElementById("learn-path-banner")?.classList.contains("show")
  );
  if (!bannerVisible) errors.push("learning path banner did not show for Hybrid Work");

  const stepCount = await page.locator("#learn-path-banner .lpb-step").count();
  if (stepCount < 2) errors.push(`expected learning path steps, got ${stepCount}`);

  await page.click("#planner-btn");
  await page.evaluate(() => window.addToStack("webex-app", "node"));
  await page.click("#ab");
  await page.waitForFunction(
    () => document.getElementById("tab-labs") != null,
    { timeout: 8000 }
  ).catch(() => errors.push("tab-labs panel missing"));

  const labsTab = await page.locator('.ptab[data-tab="labs"]').count();
  if (!labsTab) errors.push("Hands-on labs tab not found");

  await page.click('.ptab[data-tab="labs"]');
  await page.waitForTimeout(300);
  const labCards = await page.locator("#tab-labs .lab-card").count();
  if (labCards < 1) errors.push(`expected lab cards after analyze, got ${labCards}`);

  await page.evaluate(() => window.jumpTo("ise"));
  await page.waitForSelector("#pbody .p-dcloud", { timeout: 8000 }).catch(() =>
    errors.push("Learn & Try dCloud section missing on ISE panel")
  );

  const hasObjectives = await page.evaluate(() =>
    !!document.querySelector("#pbody .p-dcloud-objectives, #pbody .p-learn-ladder")
  );
  if (!hasObjectives) errors.push("Learn & Try panel missing objectives or ladder");

  if (errors.length) {
    console.error("FAIL test-dcloud-learning:");
    errors.forEach(e => console.error(" -", e));
    process.exit(1);
  }
  console.log("OK test-dcloud-learning");
} finally {
  await browser.close();
}
