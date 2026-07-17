#!/usr/bin/env node
/** Cloud Control ops — panel section, briefing handoff, and briefing page render. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", e => errors.push(`app pageerror: ${e.message}`));

  await page.goto(`file://${path.join(root, "cisco-portfolio-navigator.html")}`, {
    waitUntil: "load",
    timeout: 60000
  });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION && window.__cpnOps, { timeout: 60000 });

  // Ops model sanity
  const model = await page.evaluate(() => {
    const o = window.__cpnOps;
    const rs = o.getOpsProfile("room-systems");
    return {
      hasRoom: o.hasOps("room-systems"),
      hasBogus: o.hasOps("not-a-family"),
      roomScenario: rs?.scenarioData?.id || null,
      scenarioCount: o.scenariosForFamilies(["room-systems", "sdwan"]).length
    };
  });
  if (!model.hasRoom) errors.push("ops model missing room-systems");
  if (model.hasBogus) errors.push("ops model should return false for unknown family");
  if (!model.roomScenario) errors.push("room-systems has no scenario data");
  if (model.scenarioCount < 1) errors.push("scenariosForFamilies returned nothing");

  // Inject the ops section into a fresh panel body and verify it renders.
  const details = await page.evaluate(() => {
    const pb = document.getElementById("pbody");
    pb.innerHTML = "";
    pb.dataset.lastId = "room-systems";
    pb.dataset.lastKind = "node";
    window.insertCloudControlOps("room-systems", "node");
    const sec = pb.querySelector(".p-ops");
    return sec ? {
      hasBtn: !!sec.querySelector("[data-cc-open]"),
      domains: sec.querySelectorAll(".p-ops-domain").length,
      family: sec.dataset.familyId,
      hasScenario: !!sec.querySelector(".p-ops-scn-title")
    } : null;
  });
  if (!details) {
    errors.push("Operations · Cloud Control section did not render in panel");
  } else {
    if (!details.hasBtn) errors.push("ops section missing briefing button");
    if (!details.domains) errors.push("ops section missing domain tags");
    if (details.family !== "room-systems") errors.push(`ops section wrong family: ${details.family}`);
    if (!details.hasScenario) errors.push("ops section missing scenario title");
  }

  // Verify the briefing handoff builds a valid payload.
  const brief = await page.evaluate(() => window.buildCloudControlBrief("room-systems"));
  if (!brief) errors.push("buildCloudControlBrief returned nothing");
  else {
    if (brief.focusFamily !== "room-systems") errors.push(`brief focusFamily wrong: ${brief.focusFamily}`);
    if (!Array.isArray(brief.items)) errors.push("brief.items missing");
    if (!Array.isArray(brief.pillars)) errors.push("brief.pillars missing");
    if (!brief.account) errors.push("brief.account missing");
  }

  // Load the briefing page directly (demo fallback path) and verify it renders.
  const bp = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  bp.on("pageerror", e => errors.push(`briefing pageerror: ${e.message}`));
  await bp.goto(`file://${path.join(root, "cloud-control-briefing.html")}?focus=room-systems`, {
    waitUntil: "load",
    timeout: 30000
  });
  await bp.waitForSelector("#cc-scn-title", { timeout: 10000 });

  const rendered = await bp.evaluate(() => ({
    title: document.getElementById("cc-scn-title").textContent.trim(),
    alerts: document.querySelectorAll(".cc-alert-item").length,
    hypotheses: document.querySelectorAll("#cc-scn-hypotheses li").length,
    evidence: document.querySelectorAll("#cc-scn-evidence li").length,
    pillars: document.querySelectorAll(".cc-pillar").length,
    scenarioOptions: document.querySelectorAll("#cc-scenario-picker option").length
  }));
  if (!rendered.title || rendered.title === "—") errors.push("briefing scenario title empty");
  if (rendered.alerts < 1) errors.push("briefing rendered no alerts");
  if (rendered.hypotheses < 1) errors.push("briefing rendered no hypotheses");
  if (rendered.evidence < 1) errors.push("briefing rendered no evidence");
  if (rendered.pillars !== 3) errors.push(`expected 3 pillars, got ${rendered.pillars}`);
  if (rendered.scenarioOptions < 1) errors.push("briefing scenario picker empty");

  // Approve button flips to done state.
  await bp.click("#cc-approve");
  const approved = await bp.evaluate(() => document.getElementById("cc-approve").classList.contains("is-done"));
  if (!approved) errors.push("approve button did not enter done state");

  if (errors.length) {
    console.error("FAIL test-cloud-control-ops:");
    errors.forEach(e => console.error(" -", e));
    process.exit(1);
  }
  console.log("OK test-cloud-control-ops");
} finally {
  await browser.close();
}
