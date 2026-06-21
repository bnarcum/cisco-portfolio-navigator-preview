#!/usr/bin/env node
/** In-app Device Matrix overlay — Showroom / Aisle buttons, no external launch. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const MATRIX_PRODUCT = "desk-pro-g2";

const browser = await chromium.launch();
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 120000 });

  await page.evaluate((pid) => window.showProductDetail(pid), MATRIX_PRODUCT);
  await page.waitForSelector(".p-matrix-link", { timeout: 8000 });

  const panel = await page.evaluate(() => {
    const sec = document.querySelector(".p-matrix-link");
    const showroom = sec?.querySelector('[data-matrix-view="showroom"]');
    const aisle = sec?.querySelector('[data-matrix-view="aisle"]');
    const external = sec?.querySelector('a.la-matrix[href*="collaboration-device-matrix"]');
    const url = window.__cpnMatrixDeviceUrl?.("desk-pro-g2", "showroom");
    return {
      hasSec: !!sec,
      hasShowroom: !!showroom,
      hasAisle: !!aisle,
      hasExternal: !!external,
      url,
    };
  });
  console.log("Panel matrix UI:", panel);

  if (!panel.hasSec || !panel.hasShowroom || !panel.hasAisle || panel.hasExternal) {
    console.error("FAIL: matrix panel should offer in-app Showroom/Aisle buttons only");
    exitCode = 1;
  } else if (!panel.url?.includes("embed=cpn") || !panel.url?.includes("device=desk-pro-g2")) {
    console.error("FAIL: matrix embed URL missing expected params", panel.url);
    exitCode = 1;
  } else {
    await page.click('[data-matrix-view="showroom"]');
    await page.waitForSelector("#matrix-overlay.show", { timeout: 5000 });
    const overlay = await page.evaluate(() => {
      const ov = document.getElementById("matrix-overlay");
      const frame = document.getElementById("matrix-overlay-frame");
      return {
        open: window.__cpnMatrixOverlayOpen?.(),
        src: frame?.src || "",
        title: document.getElementById("matrix-overlay-title")?.textContent || "",
        mode: document.getElementById("matrix-overlay-mode")?.textContent || "",
        ariaHidden: ov?.getAttribute("aria-hidden"),
      };
    });
    console.log("Overlay:", overlay);
    if (!overlay.open || !overlay.src.includes("collaboration-device-matrix") || !overlay.src.includes("embed=cpn")) {
      console.error("FAIL: showroom overlay did not open with embed URL", overlay);
      exitCode = 1;
    } else {
      await page.click("#matrix-overlay-close");
      await page.waitForFunction(() => !window.__cpnMatrixOverlayOpen?.(), { timeout: 3000 });
      await page.click('[data-matrix-view="aisle"]');
      await page.waitForSelector("#matrix-overlay.show", { timeout: 5000 });
      const aisle = await page.evaluate(() => document.getElementById("matrix-overlay-frame")?.src || "");
      if (!aisle.includes("view=showcase")) {
        console.error("FAIL: aisle overlay missing view=showcase", aisle);
        exitCode = 1;
      } else {
        console.log("PASS: in-app Device Matrix Showroom and Aisle overlays OK");
      }
    }
  }
} finally {
  await browser.close();
}
process.exit(exitCode);
