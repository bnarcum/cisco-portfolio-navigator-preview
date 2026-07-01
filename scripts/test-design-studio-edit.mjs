#!/usr/bin/env node
/** Design Studio 2D editor power features: multi-select, align/distribute,
 *  copy/paste, marquee, orphan badges, zoom controls, PNG export. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", msg => {
    const t = msg.text();
    if (msg.type() === "error" && !/Failed to load resource|404/.test(t)) errors.push(`console: ${t}`);
  });

  await page.goto("http://127.0.0.1:8765/cisco-portfolio-navigator.html", { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });

  const version = await page.evaluate(() => window.__cpnV2.APP_VERSION);
  if (version !== "2.79.15") errors.push(`expected version 2.79.15, got ${version}`);

  await page.click("#design-studio-btn");
  await page.waitForSelector("#design-studio.open", { timeout: 8000 });

  // Generate a portfolio so we have nodes + links.
  await page.evaluate(() => document.querySelector("#ds-one-cisco-deck [data-pillar='workplaces']")?.click());
  await page.waitForTimeout(300);
  await page.click("#ds-generate");
  await page.waitForFunction(() => window.DesignStudio?.instance?.design?.nodes?.length >= 4, { timeout: 30000 });

  // Network tab for topology editing.
  await page.click('#ds-tabs [data-tab="network"]');
  await page.waitForTimeout(400);

  // DOM affordances present.
  const dom = await page.evaluate(() => ({
    alignBar: !!document.getElementById("ds-align-bar"),
    zoomCtl: !!document.getElementById("ds-zoom-ctl"),
    marquee: !!document.getElementById("ds-marquee"),
    ccwBtn: !!document.getElementById("ds-export-ccw"),
    zoomLabel: document.getElementById("ds-zoom-label")?.textContent || ""
  }));
  if (!dom.alignBar) errors.push("align bar missing");
  if (!dom.zoomCtl) errors.push("zoom control missing");
  if (!dom.marquee) errors.push("marquee rect missing");
  if (!dom.ccwBtn) errors.push("CCW export button missing");

  // Select all -> align bar should show when 2+ selected.
  const selRes = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.selectAllNodes();
    return { n: s.selectedNodes.size, barHidden: document.getElementById("ds-align-bar").hidden };
  });
  if (selRes.n < 2) errors.push(`select-all selected ${selRes.n} nodes`);
  if (selRes.barHidden) errors.push("align bar hidden after multi-select");

  // Align left: all selected share min x.
  const alignRes = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.alignSelection("left");
    const xs = s.selectedNodeObjs().map(n => n.x);
    return { min: Math.min(...xs), max: Math.max(...xs) };
  });
  if (Math.abs(alignRes.max - alignRes.min) > 0.5) errors.push(`align-left x spread ${alignRes.max - alignRes.min}`);

  // Distribute horizontally: centers evenly spaced (no throw, count preserved).
  const distOk = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    const before = s.selectedNodeObjs().length;
    s.alignSelection("dist-h");
    return s.selectedNodeObjs().length === before;
  });
  if (!distOk) errors.push("distribute changed selection count");

  // Copy + paste duplicates nodes and selects the pasted set.
  const pasteRes = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    const before = s.design.nodes.length;
    s.selectAllNodes();
    const selCount = s.selectedNodes.size;
    s.copySelection();
    s.pasteClipboard();
    return { added: s.design.nodes.length - before, selCount, pastedSel: s.selectedNodes.size };
  });
  if (pasteRes.added !== pasteRes.selCount) errors.push(`paste added ${pasteRes.added}, expected ${pasteRes.selCount}`);
  if (pasteRes.pastedSel !== pasteRes.added) errors.push("pasted nodes not selected");

  // Nudge moves selection.
  const nudgeRes = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    const n = s.selectedNodeObjs()[0];
    const x0 = n.x;
    s.nudgeSelection(1, 0, false);
    return n.x - x0;
  });
  if (nudgeRes <= 0) errors.push(`nudge did not move node (dx=${nudgeRes})`);

  // Marquee: programmatic box covering all nodes selects them.
  const marqRes = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.selectedNodes.clear();
    s.marquee = { x0: -10000, y0: -10000, x1: 10000, y1: 10000, additive: false };
    s.commitMarquee();
    const got = s.selectedNodes.size;
    s.marquee = null; s.hideMarquee();
    return { got, visible: s.visibleNodes().length };
  });
  if (marqRes.got !== marqRes.visible) errors.push(`marquee selected ${marqRes.got}/${marqRes.visible}`);

  // Orphan badge: add an unconnected node, expect a badge.
  const badgeRes = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.design.nodes.push({ id: "orphan-test", canvas: "network", x: 40, y: 40, w: 76, h: 46, label: "Lonely", stencilId: "switch-9300" });
    s.renderCanvas();
    return document.querySelectorAll('#ds-nodes .ds-node-badge[data-badge="orphan"]').length;
  });
  if (badgeRes < 1) errors.push("orphan badge not rendered");

  // Zoom controls update label.
  const zoomRes = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.zoomReset();
    const at100 = document.getElementById("ds-zoom-label").textContent;
    s.zoomBy(1.2);
    const after = document.getElementById("ds-zoom-label").textContent;
    return { at100, after };
  });
  if (zoomRes.at100 !== "100%") errors.push(`zoom reset label ${zoomRes.at100}`);
  if (zoomRes.after === "100%") errors.push("zoom-in did not change label");

  // PNG export runs without throwing.
  await page.evaluate(() => window.DesignStudio.instance.exportPng());
  await page.waitForTimeout(600);

  // Command palette has the new actions.
  const cmdRes = await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    const ids = s.cmdkActions().map(a => a.id);
    return ["select-all", "copy", "paste", "align-left", "dist-h", "export-png"].every(id => ids.includes(id));
  });
  if (!cmdRes) errors.push("command palette missing new actions");

  if (errors.length) {
    console.error("FAIL\n" + errors.map(e => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("Design Studio edit test OK");
  console.log("  multi-select:", selRes.n, "· paste added:", pasteRes.added, "· marquee:", marqRes.got, "· badges ok");
} finally {
  await browser.close();
}
