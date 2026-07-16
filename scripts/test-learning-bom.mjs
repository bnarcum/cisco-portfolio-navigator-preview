#!/usr/bin/env node
/** Learn tab ranks Webex Academy / Cisco U courses from canvas BOM product IDs. */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const learningJson = JSON.parse(fs.readFileSync(path.join(root, "learning-links.json"), "utf8"));

const browser = await chromium.launch();
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(data => { window.__LEARNING_BOOT = data; }, learningJson);
  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });
  await page.waitForFunction(
    () => typeof window.learningRankEntries === "function" && window.LEARNING_ENTRIES?.length > 10,
    { timeout: 15000 }
  );

  const mappingOk = await page.evaluate(() => {
    const STN = window.__DS_STENCILS;
    const boardG3 = STN.learningIdsForStencil("board-pro", { label: "Board Pro G3 75", pid: "CS-BRDP75-G3-K9" });
    const boardG355 = STN.learningIdsForStencil("board-pro", { variant: "g3-55", label: "Board Pro G3 55", pid: "CS-BRDP55-G3-K9" });
    const mic = STN.learningIdsForStencil("ceiling-mic", { label: "Ceiling Mic 1" });
    const nav = STN.learningIdsForStencil("room-navigator", { label: "Navigator" });
    return boardG3.products.includes("board-pro-g3-75")
      && boardG355.products.includes("board-pro-g3-55")
      && mic.products.includes("ceiling-mic-pro")
      && nav.products.includes("room-navigator");
  });
  if (!mappingOk) errors.push("stencil learningIdsForStencil mapping failed");

  const ranked = await page.evaluate(() => window.learningRankEntries({
    productIds: ["board-pro-g3-75", "ceiling-mic-pro", "room-navigator"],
    familyIds: ["room-systems"],
    sources: ["webex-academy", "webex-help", "cisco-u"],
    limit: 6,
    requireProductOrFamily: true
  }));
  const ids = ranked.map(e => e.id);
  if (!ids.includes("wh-board-pro-g3")) errors.push(`expected wh-board-pro-g3 in ranked skills, got ${ids.join(", ")}`);
  if (!ids.includes("wh-ceiling-mic-pro")) errors.push(`expected wh-ceiling-mic-pro in ranked skills, got ${ids.join(", ")}`);
  if (!ids.includes("wh-room-navigator")) errors.push(`expected wh-room-navigator in ranked skills, got ${ids.join(", ")}`);

  const badUrls = ranked.filter(e => /catalog\?search=/i.test(e.url || ""));
  if (badUrls.length) errors.push(`ranked entries contain catalog search URLs: ${badUrls.map(e => e.id).join(", ")}`);

  await page.evaluate(() => {
    window.DesignStudio.open();
    window.DesignStudio.instance.setTab("room");
  });
  await page.waitForSelector("#ds-sidebar-modes button[data-sidebar-mode='learn']", { timeout: 10000 });

  const boardroomLoaded = await page.evaluate(() => {
    const ds = window.DesignStudio.instance;
    const tpl = window.__DS_TEMPLATES?.ROOM_TEMPLATES?.boardroom;
    if (!tpl) return false;
    ds.addRoomTemplate("boardroom");
    return (ds.design?.nodes || []).some(n => n.stencilId === "board-pro");
  });
  if (!boardroomLoaded) errors.push("failed to load boardroom template in Design Studio");

  await page.evaluate(() => {
    window.DesignStudio.instance.setSidebarMode("learn");
  });
  await page.waitForTimeout(500);

  const exploreCtx = await page.evaluate(() => window.__DS_EXPLORE.resolveContext(window.DesignStudio.instance));
  if (!exploreCtx.bomProductIds?.length) errors.push("resolveContext missing bomProductIds for boardroom");
  if (!exploreCtx.bomProductIds?.includes("board-pro-g3-75"))
    errors.push(`boardroom BOM should include board product, got ${exploreCtx.bomProductIds?.join(", ")}`);
  if (!exploreCtx.skills?.length) errors.push("learn mode should surface skill cards for boardroom BOM");
  const skillLabels = (exploreCtx.skills || []).map(s => s.linkLabel || s.id).join(" ");
  if (!/board|navigator|mic|room/i.test(skillLabels))
    errors.push(`skill cards not product-matched: ${skillLabels}`);

  const dockHtml = await page.evaluate(() => document.getElementById("ds-explore-dock")?.innerHTML || "");
  if (!dockHtml.includes("ds-explore-card--skill")) errors.push("learn dock missing skill cards");
  if (!/Install guide|Webex Academy/i.test(dockHtml))
    errors.push("learn dock missing source-specific badges");
  if (/catalog\?search=/i.test(dockHtml))
    errors.push("learn dock still contains catalog search URLs");

  if (errors.length) {
    console.error("FAIL test-learning-bom:");
    errors.forEach(e => console.error(" -", e));
    process.exit(1);
  }
  console.log("OK test-learning-bom");
} finally {
  await browser.close();
}
