#!/usr/bin/env node
/** Visual/data polish checks: button styling, textarea font, label spacing,
 *  Board Pro network uplink (2D + 3D walk). Saves screenshots. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "docs");
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|404/.test(m.text())) errors.push(`console: ${m.text()}`); });

  await page.goto("http://127.0.0.1:8765/cisco-portfolio-navigator.html", { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });
  const version = await page.evaluate(() => window.__cpnV2.APP_VERSION);
  if (version !== "2.79.17") errors.push(`version ${version} != 2.79.17`);

  await page.click("#design-studio-btn");
  await page.waitForSelector("#design-studio.open", { timeout: 30000 });
  await page.waitForTimeout(300);

  // Cisco Spaces stencils must exist and surface in the catalog palette.
  const spaces = await page.evaluate(() => {
    const S = window.__DS_STENCILS;
    if (!S) return { ok: false };
    const cat = S.buildCatalogStencils?.([]) || [];
    const ids = new Set(cat.map(c => c.id));
    return {
      ok: true,
      connector: !!S.getDef("spaces-connector", "network"),
      mt10: !!S.getDef("mt10", "network"),
      inCatalog: ids.has("spaces-connector") && ids.has("mt10") && ids.has("spaces-cloud"),
      mrGateway: !!S.NETWORK_DEVICES?.mr57?.mtGateway
    };
  });
  if (!spaces.ok) errors.push("stencils module missing");
  if (!spaces.connector || !spaces.mt10) errors.push("Spaces stencils (connector/mt10) missing");
  if (!spaces.inCatalog) errors.push("Spaces stencils not surfaced in catalog palette");
  if (!spaces.mrGateway) errors.push("MR57 not flagged as MT gateway");

  // Spaces validation: an MT sensor with no Meraki gateway must raise an error.
  const spacesVal = await page.evaluate(() => {
    const R = window.__DS_RULES;
    if (!R?.validateSpaces) return { ok: false };
    const noGw = R.validateSpaces({ nodes: [{ id: "s1", stencilId: "mt10", canvas: "network" }], links: [] });
    const withGw = R.validateSpaces({ nodes: [
      { id: "s1", stencilId: "mt10", canvas: "network" },
      { id: "g1", stencilId: "mr57", canvas: "network" }
    ], links: [] });
    return {
      ok: true,
      errsWithoutGw: noGw.w.some(x => x.id === "spaces-mt-gw"),
      noErrWithGw: !withGw.w.some(x => x.id === "spaces-mt-gw")
    };
  });
  if (!spacesVal.ok) errors.push("validateSpaces missing");
  if (!spacesVal.errsWithoutGw) errors.push("MT sensor without gateway did not raise error");
  if (!spacesVal.noErrWithGw) errors.push("MT sensor with MR gateway still errored");

  // Intent view styling: generate button must not be a native button (has gradient bg),
  // textarea must not default to monospace.
  const intent = await page.evaluate(() => {
    const gen = document.getElementById("ds-generate");
    const ta = document.getElementById("ds-intent-text");
    const gs = getComputedStyle(gen);
    const ts = getComputedStyle(ta);
    return {
      genBgImage: gs.backgroundImage,
      genRadius: gs.borderRadius,
      taFont: ts.fontFamily.toLowerCase()
    };
  });
  if (!/gradient/.test(intent.genBgImage)) errors.push(`Generate button not styled (bg=${intent.genBgImage})`);
  if (/mono|courier/.test(intent.taFont)) errors.push(`textarea still monospace (${intent.taFont})`);
  await page.screenshot({ path: path.join(out, "polish-intent.png") });

  // Generate portfolio.
  await page.evaluate(() => document.querySelector("#ds-one-cisco-deck [data-pillar='workplaces']")?.click());
  await page.waitForTimeout(300);
  await page.click("#ds-generate");
  await page.waitForFunction(() => window.DesignStudio?.instance?.design?.rooms?.length >= 8, { timeout: 30000 });

  // Board Pro / codec must have a cat6 uplink to the room switch.
  const wiring = await page.evaluate(() => {
    const d = window.DesignStudio.instance.design;
    const isBoard = n => /board-pro|room-kit|desk-pro|room-bar/.test(n.stencilId || "");
    const isSwitch = n => /c9200|switch/.test(n.stencilId || "");
    const byId = Object.fromEntries(d.nodes.map(n => [n.id, n]));
    let boardWithUplink = 0, boardTotal = 0;
    const boards = d.nodes.filter(isBoard);
    boards.forEach(b => {
      boardTotal++;
      const linked = d.links.some(l => {
        const a = byId[l.from], c = byId[l.to];
        return (l.media || "").startsWith("cat6") &&
          ((l.from === b.id && c && isSwitch(c)) || (l.to === b.id && a && isSwitch(a)));
      });
      if (linked) boardWithUplink++;
    });
    return { boardTotal, boardWithUplink };
  });
  if (wiring.boardTotal === 0) errors.push("no board/codec nodes found");
  if (wiring.boardWithUplink < wiring.boardTotal)
    errors.push(`codec uplinks: ${wiring.boardWithUplink}/${wiring.boardTotal} have a cat6 link to a switch`);

  // Room tab — navigate to the boardroom and screenshot labels.
  await page.click('#ds-tabs [data-tab="room"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = window.DesignStudio.instance;
    const board = s.design.rooms.find(r => /board/i.test(r.template || r.name || ""));
    if (board) s.switchToRoom(board.id);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, "polish-room.png") });

  // Story mode removed — ensure no residual Story button / stepper remains.
  const story = await page.evaluate(() => ({
    btn: !!document.getElementById("ds-present"),
    dots: document.querySelectorAll(".ds-story-step .ds-story-dot").length,
    leak: typeof window.__DS_PREMIUM?.toggleStory
  }));
  if (story.btn) errors.push("Story button still present");
  if (story.dots > 0) errors.push(`story stepper still renders ${story.dots} dots`);
  if (story.leak !== "undefined") errors.push("toggleStory still exported");

  // 3D walk in the boardroom — open via API (toolbar button hides between tab states).
  await page.evaluate(() => window.DesignStudio.instance.setTab("room"));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__DS_WALK?.open?.(window.DesignStudio.instance));
  await page.waitForTimeout(1800);
  const walk = await page.evaluate(() => {
    const st = window.__DS_WALK?.debugStats?.() || {};
    return { pods: st.pods || 0, open: window.__DS_WALK?.isOpen?.() };
  });
  if (!walk.open) errors.push("walk did not open");
  const questApi = await page.evaluate(() => ({
    mod: !!window.__DS_WALK_QUEST?.start,
    quests: window.__DS_WALK_QUEST?.availableQuests?.(window.DesignStudio.instance)?.length ?? -1
  }));
  if (!questApi.mod) errors.push("Cable Quest module not loaded");
  await page.screenshot({ path: path.join(out, "polish-walk.png") });

  // Wayfinding: the "Where to?" picker should list destinations; choosing one
  // draws a route overlay (3D group) + a turn-by-turn card with a direction arrow.
  await page.evaluate(() => document.querySelector('#ds-walk-overlay [data-action="wayfind-open"]')?.click());
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => ({
    open: !document.getElementById("ds-wf-menu")?.hidden,
    rows: document.querySelectorAll("#ds-wf-list .ds-wf-poi").length
  }));
  if (!menu.open) errors.push("wayfinding 'Where to?' menu did not open");
  if (menu.rows < 2) errors.push(`wayfinding POI list rows ${menu.rows}`);
  await page.screenshot({ path: path.join(out, "polish-wayfind-menu.png") });
  // Picking a POI opens a Spaces-style preview sheet with a Directions button.
  await page.evaluate(() => document.querySelector("#ds-wf-list .ds-wf-poi")?.click());
  await page.waitForTimeout(250);
  const preview = await page.evaluate(() => ({
    open: !document.getElementById("ds-wf-preview")?.hidden,
    hasGo: !!document.querySelector(".ds-wf-pv-go")
  }));
  if (!preview.open || !preview.hasGo) errors.push("wayfinding destination preview did not appear");
  await page.screenshot({ path: path.join(out, "polish-wayfind-preview.png") });
  await page.evaluate(() => document.querySelector(".ds-wf-pv-go")?.click());
  await page.waitForTimeout(500);
  const wayfind = await page.evaluate(() => {
    const card = document.getElementById("ds-walk-wayfind");
    return {
      cardShown: card && !card.hidden,
      hasStep: !!document.getElementById("ds-wf-step"),
      hasArrow: !!document.getElementById("ds-wf-arrow"),
      routeActive: window.__DS_WALK?.hasRoute?.() ?? null
    };
  });
  if (!wayfind.cardShown) errors.push("wayfinding card did not appear after picking a destination");
  if (!wayfind.hasStep || !wayfind.hasArrow) errors.push("wayfinding card missing step/arrow");
  await page.screenshot({ path: path.join(out, "polish-wayfind.png") });

  // Cisco Spaces outcome overlay: toggling shows a live readout + a 3D group.
  await page.evaluate(() => document.querySelector('#ds-walk-overlay [data-action="outcomes"]')?.click());
  await page.waitForTimeout(700);
  const outcome = await page.evaluate(() => {
    const el = document.getElementById("ds-walk-outcomes");
    const st = window.__DS_WALK?.debugStats?.() || {};
    return {
      shown: !!el && !el.hasAttribute("hidden"),
      hasOccupancy: /occupancy/i.test(el?.textContent || ""),
      objects: st.outcomeObjects || 0,
      on: !!st.outcomes
    };
  });
  if (!outcome.shown || !outcome.hasOccupancy) errors.push("Spaces outcome readout did not appear");
  if (!outcome.on || outcome.objects < 3) errors.push(`Spaces outcome 3D overlay missing (objects=${outcome.objects})`);
  await page.screenshot({ path: path.join(out, "polish-outcomes.png") });
  await page.evaluate(() => window.__DS_WALK?.close?.());

  if (errors.length) {
    console.error("FAIL\n" + errors.map(e => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("Design Studio polish test OK");
  console.log(`  codec uplinks: ${wiring.boardWithUplink}/${wiring.boardTotal} · walk pods: ${walk.pods}`);
} finally {
  await browser.close();
}
