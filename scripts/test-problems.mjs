#!/usr/bin/env node
/** Problems → Outcomes layer: catalog, panel block, Outcomes tab, persona,
 *  reframed suggestions/bundles, symptom discovery, and plan-summary narrative. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.on("pageerror", e => errors.push(`app pageerror: ${e.message}`));

  await page.goto(`file://${path.join(root, "cisco-portfolio-navigator.html")}`, {
    waitUntil: "load",
    timeout: 60000
  });
  await page.waitForFunction(() => window.__cpnProblems && window.__cpnV2?.APP_VERSION, { timeout: 60000 });

  // 1) Catalog + resolver sanity
  const model = await page.evaluate(() => {
    const P = window.__cpnProblems;
    const cov = P.outcomeCoverage(["sdwan", "duo", "room-systems"]);
    return {
      count: P.PROBLEMS.length,
      personas: P.PERSONAS.length,
      symptoms: P.SYMPTOMS.length,
      sdwan: P.problemsForFamily("sdwan").map(p => p.id),
      bogus: P.problemsForFamily("not-a-family").length,
      bundleTop: P.topProblemForBundle("Hybrid Work Suite")?.id || null,
      addressed: cov.addressed.length,
      open: cov.open.length,
      narrative: P.problemNarrative(["sdwan", "room-systems"], "ciso")
    };
  });
  if (model.count < 15) errors.push(`expected >=15 problems, got ${model.count}`);
  if (model.personas !== 3) errors.push(`expected 3 personas, got ${model.personas}`);
  if (!model.symptoms) errors.push("no symptoms for discovery");
  if (!model.sdwan.includes("branch-app-experience")) errors.push("sdwan missing branch-app-experience");
  if (model.bogus !== 0) errors.push("unknown family should return no problems");
  if (!model.bundleTop) errors.push("no top problem for Hybrid Work Suite bundle");
  if (model.addressed < 3) errors.push(`expected addressed outcomes, got ${model.addressed}`);
  if (!/Problems this stack already addresses/.test(model.narrative)) errors.push("narrative missing addressed section");

  // 2) Panel "Problems this solves" block renders + persona toggle
  const panel = await page.evaluate(() => {
    window.showDetailPanel(window.nodeById["sdwan"]);
    const pb = document.getElementById("pbody");
    pb.dataset.lastId = "sdwan"; pb.dataset.lastKind = "node";
    window.setPersona("");
    window.insertProblemsSolved("sdwan", "node");
    const sec = pb.querySelector(".p-prob");
    const out = {
      hasSection: !!sec,
      items: pb.querySelectorAll(".p-prob-item").length,
      proof: !!pb.querySelector(".p-prob-proof"),
      personaChips: pb.querySelectorAll(".p-prob-persona").length,
      explore: !!pb.querySelector("[data-prob-explore]")
    };
    // toggle CISO persona -> outcome line should change to the CISO framing
    const before = pb.querySelector(".p-prob-outcome")?.textContent || "";
    pb.querySelector('[data-persona="ciso"]')?.click();
    const after = document.querySelector("#pbody .p-prob-outcome")?.textContent || "";
    out.personaChanged = before !== after;
    window.setPersona("");
    return out;
  });
  if (!panel.hasSection) errors.push("panel: .p-prob section did not render");
  if (!panel.items) errors.push("panel: no problem items");
  if (!panel.proof) errors.push("panel: no proof line");
  if (panel.personaChips !== 3) errors.push(`panel: expected 3 persona chips, got ${panel.personaChips}`);
  if (!panel.explore) errors.push("panel: missing explore button");
  if (!panel.personaChanged) errors.push("panel: persona toggle did not change the outcome line");

  // 3) Analyze a stack -> Outcomes tab + reframed suggestions/bundles
  const analysis = await page.evaluate(() => {
    ["sdwan", "duo", "room-systems"].forEach(id => addToStack(id, "node"));
    runAnalysis();
    document.querySelector('[data-tab="outcomes"]')?.click();
    const oc = document.getElementById("tab-outcomes");
    document.querySelector('[data-tab="bundles"]')?.click();
    const pains = document.querySelectorAll(".bun-pain").length;
    document.querySelector('[data-tab="recs"]')?.click();
    const because = document.querySelectorAll(".rc-because").length;
    return {
      addressedItems: oc.querySelectorAll(".oc-item.addressed").length,
      discover: !!oc.querySelector("[data-oc-discover]"),
      personas: oc.querySelectorAll(".oc-persona").length,
      pains, because,
      outCnt: document.getElementById("out-cnt")?.textContent
    };
  });
  if (!analysis.addressedItems) errors.push("outcomes tab: no addressed items");
  if (!analysis.discover) errors.push("outcomes tab: missing 'Start from a problem' button");
  if (analysis.personas !== 3) errors.push("outcomes tab: persona chips missing");
  if (!analysis.pains) errors.push("bundles: no pain-first headline rendered");
  if (!analysis.because) errors.push("suggestions: no 'Because' value line rendered");

  // 4) Symptom discovery modal
  const sym = await page.evaluate(() => {
    window.openSymptomPicker();
    const ov = document.getElementById("cpn-symptom-modal");
    const rows = ov ? ov.querySelectorAll(".sym-row").length : 0;
    ov?.remove();
    return { rows };
  });
  if (!sym.rows) errors.push("symptom picker: no rows");

  // 5) Graph lens + planSummary narrative
  const misc = await page.evaluate(() => {
    let lensOk = false;
    try { window.highlightProblemFamilies(window.__cpnProblems.getProblem("branch-app-experience")); lensOk = true; } catch (e) { lensOk = "err:" + e.message; }
    const s = window.__cpnV2.phases.planSummary();
    return {
      lensOk,
      hasProblems: !!(s.problems && s.problems.addressed.length),
      narrative: !!(s.problems && s.problems.narrative)
    };
  });
  if (misc.lensOk !== true) errors.push("highlightProblemFamilies threw: " + misc.lensOk);
  if (!misc.hasProblems) errors.push("planSummary().problems.addressed empty");
  if (!misc.narrative) errors.push("planSummary().problems.narrative empty");

} catch (e) {
  errors.push(`fatal: ${e.message}`);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error("❌ problems layer test FAILED:\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log("✅ problems layer test passed");
