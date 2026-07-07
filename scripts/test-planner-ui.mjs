#!/usr/bin/env node
/** Account Planner — Guided Plan link, export menu, analyze, edit stack, clear. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");

const browser = await chromium.launch();
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });
  await page.waitForTimeout(500);

  // Open planner
  await page.click("#planner-btn");
  await page.waitForSelector("#planner.open", { timeout: 5000 });

  // Start Guided Plan (banner link)
  await page.click("#pln-guided-link");
  const guidedOpen = await page.evaluate(() =>
    document.getElementById("gw-overlay")?.classList.contains("show")
  );
  if (!guidedOpen) errors.push("pln-guided-link did not open Guided Plan overlay");
  await page.click("#gw-skip");
  await page.waitForFunction(
    () => !document.getElementById("gw-overlay")?.classList.contains("show"),
    { timeout: 5000 }
  );

  // Guided Plan via action bar
  await page.click("#guided-btn");
  const guidedBtnOpen = await page.evaluate(() =>
    document.getElementById("gw-overlay")?.classList.contains("show")
  );
  if (!guidedBtnOpen) errors.push("#guided-btn did not open Guided Plan overlay");
  await page.click("#gw-skip");
  await page.waitForFunction(
    () => !document.getElementById("gw-overlay")?.classList.contains("show"),
    { timeout: 5000 }
  );

  // Quick start accordion has templates
  await page.click("#pln-quick-acc summary");
  const tplCount = await page.locator("#tpl-strip .tpl-chip").count();
  if (tplCount < 3) errors.push(`expected starter templates, got ${tplCount}`);

  // Add product + analyze
  await page.evaluate(() => window.addToStack("webex-calling", "node"));
  const abEnabled = await page.isEnabled("#ab");
  if (!abEnabled) errors.push("Analyze button still disabled after adding product");
  await page.click("#ab");
  await page.waitForFunction(
    () => {
      const el = document.getElementById("analysis-results");
      return el && getComputedStyle(el).display !== "none";
    },
    { timeout: 8000 }
  ).catch(() => errors.push("analysis-results did not appear after Analyze"));
  const resultsVisible = await page.evaluate(() => {
    const el = document.getElementById("analysis-results");
    return el && getComputedStyle(el).display !== "none";
  });
  if (!resultsVisible) errors.push("analysis-results not visible after Analyze");

  const refreshLabel = await page.evaluate(() => document.getElementById("ab").textContent);
  if (!refreshLabel.includes("Refresh")) errors.push(`expected Refresh label after analyze, got "${refreshLabel}"`);

  // Re-analyze: toast + scroll feedback
  await page.click("#ab");
  await page.waitForFunction(
    () => document.getElementById("toast").classList.contains("show"),
    { timeout: 3000 }
  ).catch(() => errors.push("toast did not show on re-analyze"));
  const toastText = await page.evaluate(() => document.getElementById("toast").textContent);
  if (!toastText.includes("refreshed")) errors.push(`re-analyze toast expected 'refreshed', got "${toastText}"`);

  const plainLabels = await page.evaluate(() => ({
    suggestionsTab: document.querySelector('.ptab[data-tab="recs"]')?.textContent?.includes("Suggestions"),
    upgradesTab: document.querySelector('.ptab[data-tab="replace"]')?.textContent?.includes("Upgrades"),
    packagesTab: document.querySelector('.ptab[data-tab="bundles"]')?.textContent?.includes("Solution packages"),
    gapsTab: document.querySelector('.ptab[data-tab="coverage"]')?.textContent?.includes("Coverage"),
    legend: !!document.querySelector("#tab-recs .recs-legend"),
    addBtn: document.querySelector("#tab-recs .rc-btn.prim")?.textContent?.includes("Add to list"),
  }));
  if (!plainLabels.suggestionsTab) errors.push("Suggestions tab label missing");
  if (!plainLabels.upgradesTab) errors.push("Upgrades tab label missing");
  if (!plainLabels.packagesTab) errors.push("Solution packages tab label missing");
  if (!plainLabels.gapsTab) errors.push("Coverage tab label missing");
  if (!plainLabels.legend) errors.push("connection strength legend missing");
  if (!plainLabels.addBtn) errors.push("Add to list button label missing");

  // Post-analyze summary + edit stack
  const summaryHidden = await page.evaluate(() => document.getElementById("planner-summary")?.hidden);
  if (summaryHidden) errors.push("planner-summary should show after analyze");
  await page.click("#pln-edit-stack");
  const setupCollapsed = await page.evaluate(() =>
    document.getElementById("planner-setup")?.classList.contains("is-collapsed")
  );
  if (setupCollapsed) errors.push("Edit stack did not expand planner-setup");

  // Export menu opens
  await page.click("#exp-btn");
  const exportOpen = await page.evaluate(() =>
    document.getElementById("exp-menu")?.classList.contains("show")
  );
  if (!exportOpen) errors.push("Export button did not open exp-menu");
  const exportFormats = await page.locator("#exp-menu .em-item").count();
  if (exportFormats < 5) errors.push(`expected export formats, got ${exportFormats}`);
  await page.keyboard.press("Escape");
  await page.click("body", { position: { x: 10, y: 10 } });

  // Overflow clear menu
  await page.click("#pf-menu-btn");
  const menuVisible = await page.evaluate(() => !document.getElementById("pf-menu")?.hidden);
  if (!menuVisible) errors.push("pf-menu did not open");
  await page.click("#clr-btn");
  const stackEmpty = await page.evaluate(() => window.__cpnV2?.phases?.readState?.().stack?.length === 0);
  if (!stackEmpty) errors.push("Clear plan did not empty stack");

  const report = {
    version: await page.evaluate(() => window.__cpnV2?.APP_VERSION),
    guidedBanner: guidedOpen,
    guidedBtn: guidedBtnOpen,
    tplCount,
    analyze: resultsVisible,
    plainLabels,
    exportOpen,
    exportFormats,
    errors,
  };
  console.log(JSON.stringify(report, null, 2));

  if (errors.length) {
    console.error("FAIL:", errors.join("; "));
    process.exit(1);
  }
  console.log("PASS: Account Planner UI actions OK");
} finally {
  await browser.close();
}
