// Guard test for the canonical device registry (single source of truth).
//
// 1. Placement: for EVERY room template, synthesizing chambers and running the
//    real walk semantic placement must land each device on its canonical
//    physical surface (ceiling mics on the ceiling, displays on the front wall,
//    controls/table mics on the table, codecs/switches in the rack) — proving
//    the "mic on the table" class of bug can't recur regardless of template
//    zone drift.
// 2. Intent BOM: an explicit device brief is honored (Navigator swap, Board Pro
//    G2 variant, exact ceiling-mic count, PoE switch present).
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = resolve(__dirname, "../cisco-portfolio-navigator.html");
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });

// ---- 1. Placement across all room templates --------------------------------
const placementErrors = await page.evaluate(() => {
  const STN = window.__DS_STENCILS;
  const LAY = window.__DS_WALK_LAYOUT;
  const TPL = window.__DS_TEMPLATES;
  const errs = [];

  for (const [key, tpl] of Object.entries(TPL.ROOM_TEMPLATES)) {
    if (!tpl.items?.length) continue;
    const chambers = tpl.items.map((it, i) => ({
      id: "c" + i, stencilId: it.stencilId, label: it.label,
      zone: it.zone, relX: it.relX, relY: it.relY,
      pos: { x: (i % 5) * 3, y: 3, z: Math.floor(i / 5) * 3 }
    }));
    const nodes = chambers.map(c => ({ id: c.id, stencilId: c.stencilId, label: c.label }));
    const frame = LAY.applySemanticPlacement(chambers, nodes, "room", { items: tpl.items });
    const frontZ = frame?.frontZ ?? 0;

    // Height (y) is the axis the placement sets from the canonical mount and is
    // never touched by the x/z separation relax — so it's the reliable proof
    // that a device sits on its correct surface.
    const credenzaZ = frame?.credenzaZ ?? 99;
    chambers.forEach(ch => {
      const prof = STN.deviceProfile(ch.stencilId, ch);
      if (!prof || !prof.mount) { errs.push(`${key}/${ch.label}: no canonical mount`); return; }
      if (ch.mount !== prof.mount) errs.push(`${key}/${ch.label}: recorded mount ${ch.mount} != canonical ${prof.mount}`);
      const y = ch.pos.y, z = ch.pos.z, m = prof.mount;
      if (m === "ceiling" && y < 2.4) errs.push(`${key}/${ch.label}: ceiling device at y=${y.toFixed(2)} (expected >=2.4)`);
      if (m === "wall-camera" && y < 2.4) errs.push(`${key}/${ch.label}: camera at y=${y.toFixed(2)} (expected >=2.4)`);
      if (m === "wall-display" && (y < 0.4 || y > 3.5)) errs.push(`${key}/${ch.label}: wall display at y=${y.toFixed(2)}`);
      if (m === "wall-panel" && (y < 1.2 || y > 1.6)) errs.push(`${key}/${ch.label}: wall panel at y=${y.toFixed(2)}`);
      if (m === "shelf" && (y < 1.0 || y > 1.7)) errs.push(`${key}/${ch.label}: shelf device at y=${y.toFixed(2)}`);
      if ((m === "table" || m === "desk" || m === "floor-table" || m === "floor-rack") && y > 1.0)
        errs.push(`${key}/${ch.label}: table/desk/floor device at y=${y.toFixed(2)} (expected <=1.0)`);
      if (m === "rack" && (y < 0.8 || y > 1.4)) errs.push(`${key}/${ch.label}: rack device at y=${y.toFixed(2)} (expected 0.8..1.4)`);
      // Front-mounted surfaces must stay in front of the credenza (gross sanity).
      if ((m === "wall-display" || m === "wall-camera" || m === "wall-panel" || m === "shelf") && z > credenzaZ + 0.6)
        errs.push(`${key}/${ch.label}: wall device at z=${z.toFixed(2)} behind credenza=${credenzaZ.toFixed(2)}`);
    });
  }

  // The original bug, stated directly: no ceiling mic anywhere on a surface.
  for (const [key, tpl] of Object.entries(TPL.ROOM_TEMPLATES)) {
    (tpl.items || []).filter(it => it.stencilId === "ceiling-mic").forEach(it => {
      const prof = STN.deviceProfile("ceiling-mic", it);
      if (prof.mount !== "ceiling") errs.push(`${key}: ceiling-mic canonical mount is ${prof.mount}`);
    });
  }
  return errs;
});
errors.push(...placementErrors);

// ---- 2. Intent BOM fidelity -------------------------------------------------
await page.evaluate(() => window.DesignStudio.open());
await page.waitForSelector("#ds-intent-text", { timeout: 10000 });

const bom = await page.evaluate(() => {
  const s = window.DesignStudio.instance;
  s.customRoomMix = null;
  document.getElementById("ds-intent-text").value =
    "a board pro g2 and a navigator in a boardroom with a poe switch and 2 ceiling mic pros";
  s.runGenerate();
  const room = s.design.nodes.filter(n => n.canvas === "room");
  const byStencil = id => room.filter(n => n.stencilId === id);
  return {
    mics: byStencil("ceiling-mic").length,
    navigators: byStencil("room-navigator").length,
    touch: byStencil("touch-10").length,
    switches: byStencil("c9200-collab").length,
    boardPid: byStencil("board-pro")[0]?.pid || null,
    boardVariant: byStencil("board-pro")[0]?.variant || null,
  };
});

if (bom.mics !== 2) errors.push(`intent BOM: ${bom.mics} ceiling mics, expected 2`);
if (bom.navigators < 1) errors.push(`intent BOM: navigator not present (touch swap failed)`);
if (bom.touch !== 0) errors.push(`intent BOM: ${bom.touch} touch-10 left, expected 0 (should swap to navigator)`);
if (bom.switches < 1) errors.push(`intent BOM: PoE switch missing`);
if (bom.boardVariant !== "g2") errors.push(`intent BOM: board-pro variant ${bom.boardVariant}, expected g2`);
if (bom.boardPid !== "CS-BRD-PRO-G2-75") errors.push(`intent BOM: board-pro pid ${bom.boardPid}, expected CS-BRD-PRO-G2-75`);

await browser.close();

if (errors.length) { console.error("FAIL test-device-registry\n" + errors.join("\n")); process.exit(1); }
console.log(`OK test-device-registry\n  placement verified across all room templates · intent BOM honored (navigator, G2, 2 mics, switch)`);
