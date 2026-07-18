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
      narrative: P.problemNarrative(["sdwan", "room-systems"], "ciso"),
      editorial: (() => {
        const byId = id => P.getProblem(id);
        const text = P.PROBLEMS.flatMap(p => [
          p.outcome,
          ...Object.values(p.personas || {}).flatMap(v => typeof v === "string"
            ? [v]
            : [v.symptom, v.line, v.proof?.before, v.proof?.after])
        ]).filter(Boolean).join("\n");
        return {
          allSourced: P.PROBLEMS.every(p =>
            p.proof?.source &&
            /^https:\/\/([a-z0-9-]+\.)*(cisco|webex|splunk|thousandeyes|appdynamics)\.com\//.test(p.proof?.sourceUrl || "")
          ),
          campusMapping: !byId("campus-manual-ops")?.families?.includes("intersight"),
          aiFabricMapping:
            byId("ai-fabric-bottleneck")?.families?.includes("nexus-dashboard") &&
            !byId("ai-fabric-bottleneck")?.signals?.missing?.includes("thousandeyes"),
          nexusDashboardFamily:
            !!window.nodeById?.["nexus-dashboard"] &&
            typeof PRODUCTS !== "undefined" &&
            PRODUCTS.filter(p => /^nd-/.test(p.id)).every(p => p.family === "nexus-dashboard"),
          aiBundleScoped: typeof BUNDLES !== "undefined" && (() => {
            const b = BUNDLES.find(x => x.name === "AI-Ready Data Center Network");
            return !!b &&
              ["nexus", "nexus-dashboard", "ucs", "intersight"].every(id => b.products.includes(id)) &&
              !b.products.includes("catalyst-center") &&
              !b.products.includes("thousandeyes");
          })(),
          aiSecuritySplit:
            byId("ai-app-security")?.families?.includes("ai-defense") &&
            !byId("ai-app-security")?.families?.includes("hypershield") &&
            byId("workload-runtime-protection")?.families?.includes("hypershield"),
          campusSegmentationScoped:
            !byId("flat-network-breach")?.families?.includes("hypershield") &&
            !byId("flat-network-breach")?.families?.includes("secure-workload"),
          hyperflexLifecycle: P.topProblemForFamily("hyperflex")?.id === "hyperflex-migration",
          hyperflexCatalogStatus: typeof PRODUCTS !== "undefined" &&
            PRODUCTS.filter(p => p.family === "hyperflex").every(p => p.status !== "current"),
          roomSource: /Control Hub.*ThousandEyes/i.test(byId("room-quality")?.proof?.source || ""),
          cloudControlQualified: /Controlled Availability/i.test(byId("tool-sprawl-ops")?.proof?.source || ""),
          collaborationScoped: (() => {
            const hybrid = byId("hybrid-meeting-equity");
            const pbx = byId("pbx-eol");
            const cx = byId("contact-center-cx");
            const room = byId("room-quality");
            return !hybrid?.families?.includes("conf-phones") &&
              pbx?.maturityNext === "hybrid-meeting-equity" &&
              cx?.maturityNext == null &&
              cx?.useCases?.includes("Contact Center") &&
              !cx?.families?.includes("webex-calling") &&
              !cx?.families?.includes("webex-app") &&
              !room?.families?.includes("cloud-control");
          })(),
          callingModernizationBalanced: (() => {
            const calling = byId("pbx-eol");
            const text = [
              calling?.symptom,
              calling?.outcome,
              calling?.proof?.before,
              calling?.proof?.after,
              ...Object.values(calling?.personas || {}).flatMap(v => [
                v?.symptom, v?.line, v?.proof?.before, v?.proof?.after
              ])
            ].filter(Boolean).join(" ");
            const legacyUcm = typeof LEGACY_NODES !== "undefined"
              ? LEGACY_NODES.find(x => x.id === "l-cucm")
              : null;
            return calling?.families?.includes("unified-cm") &&
              calling?.families?.includes("webex-calling") &&
              calling?.families?.includes("ip-phones") &&
              !calling?.signals?.missing?.includes("webex-calling") &&
              !/\bshrinking\b|\bno agility\b|\breplacing on-premises\b|\blegacy telephony\b/i.test(text) &&
              !!window.nodeById?.["unified-cm"] &&
              !/\breplacing on-premises\b/i.test(window.nodeById?.["webex-calling"]?.desc || "") &&
              /unsupported|out-of-support/i.test(legacyUcm?.name || "") &&
              /upgrade|deployment model/i.test(legacyUcm?.reason || "") &&
              PRODUCTS.some(p => p.id === "ucm-15" && p.family === "unified-cm" && p.status === "current") &&
              PRODUCTS.some(p => p.id === "wxc-dedicated-instance" && p.family === "webex-calling" && p.status === "current");
          })(),
          securityScoped: (() => {
            const vpn = byId("vpn-overload");
            const email = byId("phishing-email");
            const ai = byId("ai-app-security");
            const runtime = byId("workload-runtime-protection");
            return !vpn?.families?.includes("umbrella") &&
              email?.families?.includes("xdr") &&
              !email?.families?.includes("secure-web") &&
              ai?.useCases?.includes("Threat Detection & Response") &&
              runtime?.families?.length === 2 &&
              runtime.families.includes("hypershield") &&
              runtime.families.includes("secure-workload");
          })(),
          operationsScoped: (() => {
            const obs = byId("observability-blindspots");
            const tools = byId("tool-sprawl-ops");
            const assets = byId("unknown-assets");
            const vulns = byId("vulnerability-prioritization");
            return !obs?.families?.includes("cloud-control") &&
              tools?.families?.length === 1 &&
              tools.families[0] === "cloud-control" &&
              assets?.families?.length === 1 &&
              assets.families[0] === "cisco-iq" &&
              vulns?.families?.length === 1 &&
              vulns.families[0] === "vuln-mgmt";
          })(),
          catalogAvailabilityQualified:
            /Controlled Availability/i.test(window.nodeById?.["cloud-control"]?.desc || "") &&
            /Controlled Availability/i.test(BUNDLES.find(x => x.name === "Cloud Control Platform")?.desc || ""),
          appDynamicsBrand: window.nodeById?.appdynamics?.name === "Splunk AppDynamics",
          noGuaranteeLanguage: !/\b(stops? lateral movement cold|every time|complete asset inventory|nothing to babysit)\b/i.test(text)
        };
      })(),
      pv: (() => {
        const prob = P.getProblem("branch-app-experience");
        const net = P.personaView(prob, "netops");
        const ci = P.personaView(prob, "ciso");
        const base = P.personaView(prob, "");
        return {
          symptomDiffers: net.symptom !== ci.symptom,
          proofDiffers: net.proof?.after !== ci.proof?.after,
          lineDiffers: net.line !== ci.line,
          baseFallback: base.symptom === prob.symptom && base.line === prob.outcome
        };
      })()
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
  if (!model.pv.symptomDiffers) errors.push("personaView: symptom should differ across personas");
  if (!model.pv.proofDiffers) errors.push("personaView: proof before/after should differ across personas");
  if (!model.pv.lineDiffers) errors.push("personaView: outcome line should differ across personas");
  if (!model.pv.baseFallback) errors.push("personaView: no-persona should fall back to base symptom/outcome");
  if (!model.editorial.allSourced) errors.push("catalog: every problem needs an official source URL");
  if (!model.editorial.campusMapping) errors.push("catalog: campus automation must not map to Intersight");
  if (!model.editorial.aiFabricMapping) errors.push("catalog: AI fabric assurance must map to Nexus Dashboard/ACI, not ThousandEyes");
  if (!model.editorial.nexusDashboardFamily) errors.push("catalog: Nexus Dashboard needs a first-class family mapping");
  if (!model.editorial.aiBundleScoped) errors.push("catalog: AI-ready data-center bundle has incorrect core products");
  if (!model.editorial.aiSecuritySplit) errors.push("catalog: AI Defense and Hypershield need separate problems");
  if (!model.editorial.campusSegmentationScoped) errors.push("catalog: campus segmentation should not imply workload-security products");
  if (!model.editorial.hyperflexLifecycle) errors.push("catalog: HyperFlex should lead with its current migration/EOL motion");
  if (!model.editorial.hyperflexCatalogStatus) errors.push("catalog: HyperFlex products must not remain marked current after HXDP end of maintenance");
  if (!model.editorial.roomSource) errors.push("catalog: room-quality proof should cite Control Hub + ThousandEyes");
  if (!model.editorial.cloudControlQualified) errors.push("catalog: Cloud Control claims must disclose Controlled Availability");
  if (!model.editorial.collaborationScoped) errors.push("catalog: Collaboration mappings or maturity chains are out of scope");
  if (!model.editorial.callingModernizationBalanced) errors.push("catalog: Calling modernization must treat supported on-prem, cloud, and hybrid models as valid");
  if (!model.editorial.securityScoped) errors.push("catalog: Security mappings blur distinct control domains");
  if (!model.editorial.operationsScoped) errors.push("catalog: Operations mappings blur Cisco IQ, Cloud Control, and vulnerability management");
  if (!model.editorial.catalogAvailabilityQualified) errors.push("catalog: Cloud Control family and bundle must disclose Controlled Availability");
  if (!model.editorial.appDynamicsBrand) errors.push("catalog: AppDynamics family must use current Splunk branding");
  if (!model.editorial.noGuaranteeLanguage) errors.push("catalog: remove absolute/guarantee language");

  // 2) Canvas outcome card renders + persona toggle (not side panel)
  const card = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 800)); // dCloud/learning links load
    document.querySelector('[data-vm="families"]')?.click();
    await new Promise(r => setTimeout(r, 350));
    window.setPersona("");
    window.__cpnOutcomeCard.show("sdwan", window.nodeById["sdwan"]);
    const el = document.getElementById("outcome-card");
    // Simulate stale dimmed icons from an explore highlight.
    document.querySelectorAll("use.icn").forEach(n => n.setAttribute("opacity", "0.1"));
    const out = {
      visible: el?.style.display !== "none",
      hasProof: !!el?.querySelector(".oc-compare"),
      personaChips: el?.querySelectorAll(".oc-persona").length || 0,
      noPanelBlock: !document.querySelector("#pbody .p-prob"),
      noJourney: !el?.querySelector(".oc-journey")
    };
    const grab = () => {
      const c = document.getElementById("outcome-card");
      return {
        headline: c?.querySelector(".oc-headline")?.textContent || "",
        quote: c?.querySelector(".oc-quote")?.textContent || "",
        after: c?.querySelector(".oc-compare-after")?.textContent || ""
      };
    };
    el?.querySelector('[data-oc-persona="netops"]')?.click();
    const net = grab();
    document.getElementById("outcome-card")?.querySelector('[data-oc-persona="ciso"]')?.click();
    const ciso = grab();
    out.personaChanged = net.headline !== ciso.headline;
    out.quoteChanged = net.quote !== ciso.quote;
    out.proofChanged = net.after !== ciso.after;
    // Persona toggle must restore graph icons (not leave them dimmed/blank).
    const icnOpacities = Array.from(document.querySelectorAll("#gs use.icn"))
      .map(n => parseFloat(n.getAttribute("opacity") || "1"));
    out.iconsRestored = icnOpacities.length > 0 && icnOpacities.every(o => o >= 0.9);
    window.setPersona("");
    return out;
  });
  if (!card.visible) errors.push("canvas: outcome card did not show");
  if (!card.noJourney) errors.push("canvas: journey section should be removed");
  if (!card.hasProof) errors.push("canvas: no proof line");
  if (card.personaChips !== 3) errors.push(`canvas: expected 3 persona chips, got ${card.personaChips}`);
  if (!card.personaChanged) errors.push("canvas: persona toggle did not change outcome");
  if (!card.quoteChanged) errors.push("canvas: persona toggle did not change symptom quote");
  if (!card.proofChanged) errors.push("canvas: persona toggle did not change before/after proof");
  if (!card.iconsRestored) errors.push("canvas: persona toggle left graph icons dimmed");
  if (!card.noPanelBlock) errors.push("side panel should not contain .p-prob block");

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
