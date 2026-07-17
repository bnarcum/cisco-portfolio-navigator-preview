#!/usr/bin/env node
/** Design Studio — room diagram paints without click; Walk overlay opens. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
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

  // Open Design Studio (lazy-loaded on first click)
  await page.click("#design-studio-btn");
  await page.waitForFunction(() => window.DesignStudio?.instance, { timeout: 30000 });
  await page.waitForSelector("#design-studio.open", { timeout: 30000 });

  // Generate 18-room portfolio via workplaces pillar + generate
  await page.evaluate(() => {
    document.querySelector("#ds-one-cisco-deck [data-pillar='workplaces']")?.click();
  });
  await page.waitForTimeout(300);
  await page.click("#ds-generate");
  await page.waitForFunction(
    () => window.DesignStudio?.instance?.design?.rooms?.length >= 10,
    { timeout: 30000 }
  );

  // Room tab
  await page.click('#ds-tabs [data-tab="room"]');
  await page.waitForTimeout(400);

  const beforeClick = await page.evaluate(() => {
    const studio = window.DesignStudio?.instance;
    const nodesG = document.getElementById("ds-nodes");
    const nodes = document.querySelectorAll("#ds-nodes .ds-node");
    const links = document.querySelectorAll("#ds-links .ds-link");
    const svg = document.getElementById("ds-svg");
    const rect = svg?.getBoundingClientRect();
    const vp = document.getElementById("ds-viewport");
    const t = vp?.getAttribute("transform") || "";
    const first = nodes[0]?.getBoundingClientRect();
    return {
      tab: studio?.tab,
      nodeCount: nodes.length,
      nodesGChildCount: nodesG?.childElementCount ?? -1,
      nodesGHtmlLen: nodesG?.innerHTML?.length ?? 0,
      linkCount: links.length,
      visibleNodes: studio?.visibleNodes?.()?.length ?? 0,
      svgW: rect?.width ?? 0,
      svgH: rect?.height ?? 0,
      transform: t,
      firstNodeOnScreen: first ? first.width > 0 && first.height > 0 && first.right > 0 && first.bottom > 0 : false,
      pan: studio?.pan,
      stencils: !!window.__DS_STENCILS,
      renderErr: window.__dsLastRenderErr || null
    };
  });

  if (beforeClick.visibleNodes < 3) errors.push(`expected room nodes, visibleNodes=${beforeClick.visibleNodes}`);
  if (beforeClick.nodeCount < 3) errors.push(`expected DOM nodes before click, got ${beforeClick.nodeCount}`);
  if (beforeClick.svgW < 100 || beforeClick.svgH < 100) errors.push(`svg size too small: ${beforeClick.svgW}x${beforeClick.svgH}`);
  if (!beforeClick.firstNodeOnScreen) {
    errors.push(`diagram not on screen before click (transform=${beforeClick.transform}, pan=${JSON.stringify(beforeClick.pan)})`);
  }

  // Walk toolbar (Three.js loads on first open — allow time for scene build)
  await page.click("#ds-walk-corridor");
  await page.waitForFunction(() => window.__DS_WALK?.isOpen?.(), { timeout: 60000 });
  await page.waitForFunction(
    () => (window.__DS_WALK?.debugStats?.()?.pods || 0) >= 3,
    { timeout: 45000 }
  );
  const walk = await page.evaluate(() => {
    const stats = window.__DS_WALK?.debugStats?.() || {};
    return {
      overlayHidden: document.getElementById("ds-walk-overlay")?.hidden,
      walkOpen: window.__DS_WALK?.isOpen?.(),
      status: document.getElementById("ds-walk-status")?.textContent || "",
      canvasW: document.getElementById("ds-walk-canvas")?.width || 0,
      pods: stats.pods || 0,
      minimap: !!document.getElementById("ds-walk-minimap"),
      navChips: document.querySelectorAll(".ds-walk-dev").length,
      hasRenderer: !!stats.hasRenderer,
      hasError: document.getElementById("ds-walk-status")?.classList.contains("ds-walk-error")
    };
  });
  if (walk.overlayHidden !== false) errors.push("walk overlay still hidden after click");
  if (!walk.walkOpen) errors.push(`walk not open; status="${walk.status}"`);
  if (walk.canvasW < 100) errors.push(`walk canvas width ${walk.canvasW}`);
  if (walk.pods < 3) errors.push(`expected device pods, got ${walk.pods}`);
  if (!walk.minimap) errors.push("walk minimap missing");
  if (walk.navChips < 3) errors.push(`expected device nav chips, got ${walk.navChips}`);
  if (!walk.hasRenderer) errors.push("walk missing WebGL renderer");
  if (walk.hasError) errors.push(`walk error status: ${walk.status}`);
  // Mission component removed — ensure no residual mission/briefing/XP UI.
  const mission = await page.evaluate(() => ({
    hasMissions: !!window.__DS_MISSIONS,
    briefing: !!document.getElementById("ds-walk-briefing"),
    missionPanel: !!document.getElementById("ds-walk-mission"),
    xpBar: !!document.getElementById("ds-walk-xp-bar"),
    startBtn: !!document.getElementById("ds-mission-start")
  }));
  if (mission.hasMissions) errors.push("missions module still loaded");
  if (mission.briefing) errors.push("mission briefing overlay still present");
  if (mission.missionPanel) errors.push("mission HUD panel still present");
  if (mission.xpBar) errors.push("mission XP bar still present");
  if (mission.startBtn) errors.push("mission start button still present");

  await page.evaluate(() => window.__DS_WALK?.close?.());
  await page.waitForTimeout(200);

  if (errors.length) {
    console.error("FAIL\n" + errors.map(e => `  - ${e}`).join("\n"));
    console.error("beforeClick", JSON.stringify(beforeClick, null, 2));
    process.exit(1);
  }
  console.log("Design Studio room test OK");
  console.log("  nodes on screen without click:", beforeClick.nodeCount);
  console.log("  walk opened, pods:", walk.pods);
} finally {
  await browser.close();
}
