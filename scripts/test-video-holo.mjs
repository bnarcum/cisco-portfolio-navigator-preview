#!/usr/bin/env node
/** Hologram player + Watch first panel section. */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const videoJson = JSON.parse(fs.readFileSync(path.join(root, "video-links.json"), "utf8"));
const dcloudJson = JSON.parse(fs.readFileSync(path.join(root, "dcloud-links.json"), "utf8"));

const browser = await chromium.launch();
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript((v, d) => {
    window.__VIDEO_BOOT = v;
    window.__DCLOUD_BOOT = d;
  }, videoJson, dcloudJson);
  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });
  await page.waitForFunction(
    () => window.VIDEO_ENTRIES?.length > 0,
    { timeout: 15000 }
  );

  const holoExists = await page.evaluate(() => !!document.getElementById("holo-player"));
  if (!holoExists) errors.push("#holo-player missing from DOM");

  await page.evaluate(() => window.applyViewLevel("all-products"));
  await page.waitForTimeout(800);

  const badgeCount = await page.evaluate(() =>
    document.querySelectorAll("g.nd .vid-badge").length
  );
  if (badgeCount < 1) errors.push("expected video badges on nodes in All Products");

  await page.evaluate(() => window.jumpTo("xdr"));
  await page.waitForSelector("#pbody .p-video", { timeout: 8000 }).catch(() =>
    errors.push("Watch first panel section missing on XDR")
  );

  const videoCards = await page.evaluate(() =>
    document.querySelectorAll("#pbody .p-video-entry").length
  );
  if (videoCards < 1) errors.push("expected video entries in panel");

  await page.evaluate(() => window.applyViewLevel("composition", { focusFamily: "xdr" }));
  await page.waitForTimeout(900);

  const holoFn = await page.evaluate(() => typeof window.holoForNode === "function");
  if (!holoFn) errors.push("holoForNode not exported");

  if (errors.length) {
    console.error("FAIL test-video-holo:");
    errors.forEach(e => console.error(" -", e));
    process.exit(1);
  }
  console.log("OK test-video-holo");
} finally {
  await browser.close();
}
