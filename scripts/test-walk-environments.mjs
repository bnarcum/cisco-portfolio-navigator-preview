#!/usr/bin/env node
/** Walk — semantic placement + adaptive venues (room + network). */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8765/cisco-portfolio-navigator.html";
const errors = [];

function near(a, b, eps = 1.2) {
  return Math.abs(a - b) <= eps;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));

  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.click("#design-studio-btn");
  await page.waitForSelector("#design-studio.open", { timeout: 8000 });

  // Auditorium: stage + seats, no ceiling lattice.
  await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.design = { account: "test", rooms: [], nodes: [], links: [], bomOverrides: [], snapshots: [] };
    s.addRoomTemplate("auditorium");
    s.setTab("room");
  });
  await page.click("#ds-walk-corridor");
  await page.waitForFunction(() => window.__DS_WALK?.isOpen?.(), { timeout: 60000 });
  await page.waitForTimeout(900);
  const aud = await page.evaluate(() => window.__DS_WALK?.debugStats?.() || {});
  const audTags = aud.environmentTags || {};
  if (!audTags["room-stage"]) errors.push("auditorium walk missing room-stage environment");
  if (!audTags["room-seat-row"] || audTags["room-seat-row"] < 3) errors.push(`auditorium expected >=3 seat rows, got ${audTags["room-seat-row"] || 0}`);
  if (audTags["room-ceiling-grid"]) errors.push("auditorium should not render ceiling lattice");
  await page.evaluate(() => window.__DS_WALK?.close?.(true));

  // Conference: display + camera on front wall; touch on table height.
  await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.design = { account: "test", rooms: [], nodes: [], links: [], bomOverrides: [], snapshots: [] };
    s.addRoomTemplate("conference");
    s.setTab("room");
  });
  await page.waitForTimeout(300);
  await page.click("#ds-walk-corridor");
  await page.waitForFunction(() => window.__DS_WALK?.isOpen?.(), { timeout: 60000 });
  await page.waitForTimeout(1200);
  const conf = await page.evaluate(() => window.__DS_WALK?.debugStats?.() || {});
  const chambers = conf.chambers || [];
  const display = chambers.find(c => c.kind === "display" || /display/i.test(c.label));
  const camera = chambers.find(c => c.kind === "camera" || /quad|cam/i.test(c.label));
  const touch = chambers.find(c => /touch/i.test(c.label));
  if (!display) errors.push("conference walk missing display chamber");
  if (!camera) errors.push("conference walk missing camera chamber");
  if (!touch) errors.push("conference walk missing touch chamber");
  if (display && camera && !near(display.z, camera.z, 0.6)) errors.push(`display/camera should share front wall (z ${display.z} vs ${camera.z})`);
  if (touch && touch.zone !== "table") errors.push(`touch should be table zone, got ${touch.zone}`);
  if (touch && (touch.y > 1.2 || touch.y < 0.6)) errors.push(`touch should be tabletop height (~0.82), got y=${touch.y}`);
  const sw = chambers.find(c => /switch|9200|9300/i.test(c.label || ""));
  if (display && display.z > 1.5) errors.push(`display should be on front wall (z~0), got z=${display.z}`);
  if (sw && sw.z > 12) errors.push(`switch should be in credenza zone (z<12), got z=${sw.z}`);
  if (display && sw && Math.abs(display.z - sw.z) > 12) errors.push(`room depth too wide (display z=${display.z}, switch z=${sw.z})`);
  if (!conf.environmentTags?.["room-credenza-raceway"]) errors.push("conference should render credenza cable raceway");
  if (!conf.environmentTags?.["room-floor"]) errors.push("conference should use professional carpet floor");

  // Room walk open → switch to network tab must rebuild (regression: mid is not defined).
  await page.evaluate(() => {
    window.__DS_TEMPLATES.applyNetworkTemplate(
      window.DesignStudio.instance.design, "campus3tierRedundant", 80, 80, window.__DS_STENCILS);
    window.DesignStudio.instance.setTab("network");
  });
  // Cinematic addons (post-FX) add async load latency before device pods stream in.
  await page.waitForFunction(() => (window.__DS_WALK?.debugStats?.()?.pods || 0) >= 3, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const netRebuild = await page.evaluate(() => ({
    open: window.__DS_WALK?.isOpen?.(),
    kind: window.__DS_WALK?.debugStats?.()?.graphKind,
    err: document.getElementById("ds-walk-status")?.classList.contains("ds-walk-error"),
    status: document.getElementById("ds-walk-status")?.textContent || "",
    cables: window.__DS_WALK?.debugStats?.()?.cables || 0,
    pods: window.__DS_WALK?.debugStats?.()?.pods || 0
  }));
  if (!netRebuild.open) errors.push("network tab switch closed walk overlay");
  if (netRebuild.err) errors.push(`network rebuild failed: ${netRebuild.status}`);
  if (netRebuild.kind !== "network") errors.push(`expected network graph after tab switch, got ${netRebuild.kind}`);
  if (netRebuild.cables < 1) errors.push(`network walk expected cables, got ${netRebuild.cables}`);
  if (netRebuild.pods < 3) errors.push(`network walk expected pods, got ${netRebuild.pods}`);
  await page.evaluate(() => window.__DS_WALK?.close?.(true));

  // Campus: floor-only decor (no rack rows, walls, or ceiling tray).
  await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.design = { account: "test", rooms: [], nodes: [], links: [], bomOverrides: [], snapshots: [] };
    window.__DS_TEMPLATES.applyNetworkTemplate(s.design, "campus3tierRedundant", 80, 80, window.__DS_STENCILS);
    s.setTab("network");
  });
  await page.waitForTimeout(300);
  await page.click("#ds-walk-corridor");
  await page.waitForFunction(() => window.__DS_WALK?.isOpen?.(), { timeout: 60000 });
  await page.waitForTimeout(900);
  const campus = await page.evaluate(() => ({ tags: window.__DS_WALK?.debugStats?.()?.environmentTags || {}, fx: !!window.__DS_WALK_FX?.loaded?.() }));
  const campusTags = campus.tags;
  // NOC environment (data-center shell) replaces the old grass/voxel world.
  if (campus.fx && !campusTags["network-noc-floor"]) errors.push("campus walk should render NOC raised floor");
  if (campus.fx && !campusTags["network-noc-rack"]) errors.push("campus walk should render NOC rack rows");
  if (campusTags["network-rack-row"]) errors.push(`campus walk should not render legacy rack rows, got ${campusTags["network-rack-row"]}`);
  if (campusTags["network-closet-wall"]) errors.push("campus walk should not render legacy closet walls");
  await page.evaluate(() => window.__DS_WALK?.close?.(true));

  // Data center: floor-only decor (no rack rows or closet walls).
  await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    s.design = { account: "test", rooms: [], nodes: [], links: [], bomOverrides: [], snapshots: [] };
    window.__DS_TEMPLATES.applyNetworkTemplate(s.design, "dcAciPod", 80, 80, window.__DS_STENCILS);
    s.setTab("network");
  });
  await page.waitForTimeout(300);
  await page.click("#ds-walk-corridor");
  await page.waitForFunction(() => window.__DS_WALK?.isOpen?.(), { timeout: 60000 });
  await page.waitForTimeout(900);
  const dc = await page.evaluate(() => ({ tags: window.__DS_WALK?.debugStats?.()?.environmentTags || {}, fx: !!window.__DS_WALK_FX?.loaded?.() }));
  const dcTags = dc.tags;
  if (dc.fx && !dcTags["network-noc-floor"]) errors.push("DC walk should render NOC raised floor");
  if (dc.fx && !dcTags["network-noc-lightstrip"]) errors.push("DC walk should render NOC ceiling light strips");
  if (dcTags["network-rack-row"]) errors.push(`DC walk should not render legacy rack rows, got ${dcTags["network-rack-row"]}`);

  if (errors.length) {
    console.error("FAIL test-walk-environments\n" + errors.map(e => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("OK test-walk-environments");
} finally {
  await browser.close();
}
