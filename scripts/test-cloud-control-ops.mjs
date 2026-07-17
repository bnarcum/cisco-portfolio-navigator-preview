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

  // Load the AI Canvas board directly (demo fallback path) and verify it renders.
  const bp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  bp.on("pageerror", e => errors.push(`briefing pageerror: ${e.message}`));
  await bp.goto(`file://${path.join(root, "cloud-control-briefing.html")}?focus=room-systems`, {
    waitUntil: "load",
    timeout: 30000
  });
  await bp.waitForSelector("#cc-board .cc-widget", { timeout: 10000 });

  const rendered = await bp.evaluate(() => ({
    title: document.getElementById("cc-board-title").textContent.trim(),
    boards: document.querySelectorAll(".cc-board-item").length,
    widgets: document.querySelectorAll("#cc-board .cc-widget").length,
    chart: document.querySelectorAll("#cc-board .cc-chart").length,
    topo: document.querySelectorAll("#cc-board .cc-topo").length,
    hasApprove: !!document.getElementById("cc-approve"),
    presence: document.querySelectorAll("#cc-presence .cc-av").length,
    composer: !!document.getElementById("cc-input")
  }));
  if (!rendered.title || rendered.title === "—") errors.push("board title empty");
  if (rendered.boards < 1) errors.push("board library empty");
  if (rendered.widgets < 5) errors.push(`expected >=5 widgets, got ${rendered.widgets}`);
  if (rendered.chart < 1) errors.push("no chart widget rendered");
  if (rendered.topo < 1) errors.push("no topology widget rendered");
  if (!rendered.hasApprove) errors.push("no approve action");
  if (rendered.presence < 2) errors.push("presence avatars missing");
  if (!rendered.composer) errors.push("assistant composer missing");

  // Approve button flips to done + board resolves.
  await bp.click("#cc-approve");
  const approved = await bp.evaluate(() => ({
    done: document.getElementById("cc-approve").classList.contains("is-done"),
    resolved: document.getElementById("cc-board-status").classList.contains("is-resolved")
  }));
  if (!approved.done) errors.push("approve button did not enter done state");
  if (!approved.resolved) errors.push("board status did not flip to resolved");

  // Streaming conversation eventually posts agent messages.
  await bp.waitForFunction(() => document.querySelectorAll("#cc-thread .cc-msg").length >= 2, { timeout: 8000 })
    .catch(() => errors.push("conversation did not stream agent messages"));

  if (errors.length) {
    console.error("FAIL test-cloud-control-ops:");
    errors.forEach(e => console.error(" -", e));
    process.exit(1);
  }
  console.log("OK test-cloud-control-ops");
} finally {
  await browser.close();
}
