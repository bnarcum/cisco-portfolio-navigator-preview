/* Cloud Control Briefing Canvas (demo) runtime.
   Reads plan context handed off from the Portfolio Navigator (sessionStorage),
   or falls back to a representative demo estate. All telemetry is illustrative. */
(function () {
  "use strict";

  const ops = window.__cpnOps;
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const params = new URLSearchParams(location.search);
  const focusFamily = params.get("focus");

  const DEMO_BRIEF = {
    account: "Demo Account",
    focusFamily: focusFamily || null,
    stackFamilies: ["cloud-control", "room-systems", "webex-calling", "sdwan", "thousandeyes", "meraki-mx"],
    items: [
      { id: "cloud-control", name: "Cisco Cloud Control", category: "Networking", pillar: "Resilience" },
      { id: "room-systems", name: "Room Systems", category: "Collaboration", pillar: "Workplaces" },
      { id: "webex-calling", name: "Webex Calling", category: "Collaboration", pillar: "Workplaces" },
      { id: "sdwan", name: "Catalyst SD-WAN", category: "Networking", pillar: "Resilience" },
      { id: "thousandeyes", name: "ThousandEyes", category: "Observability", pillar: "Resilience" },
      { id: "meraki-mx", name: "Meraki MX", category: "Networking", pillar: "Resilience" }
    ],
    pillars: [
      { id: "ai-dc", shortLabel: "AI-Ready DC", covered: false },
      { id: "workplaces", shortLabel: "Workplaces", covered: true },
      { id: "resilience", shortLabel: "Resilience", covered: true }
    ],
    bundles: [],
    cloudControlPackage: null
  };

  let brief = DEMO_BRIEF;
  try {
    const raw = sessionStorage.getItem("cpn-cc-brief");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        brief = parsed;
        if (focusFamily) brief.focusFamily = focusFamily;
        if (!brief.stackFamilies || !brief.stackFamilies.length) brief.stackFamilies = DEMO_BRIEF.stackFamilies;
        if (!brief.items || !brief.items.length) brief.items = DEMO_BRIEF.items;
      }
    }
  } catch (e) { /* fall back to demo */ }

  const SEV_BY_INDEX = ["crit", "warn", "warn"];

  function renderAccount() {
    const el = $("#cc-account");
    if (el) el.textContent = brief.account || "Unnamed Account";
  }

  function renderInventory() {
    const items = brief.items || [];
    $("#cc-inv-items").textContent = items.length;
    $("#cc-inv-families").textContent = (brief.stackFamilies || []).length;
    const list = $("#cc-inv-list");
    if (!items.length) {
      list.innerHTML = '<li class="cc-empty">No products in the plan yet. Add products in the Portfolio Navigator, then reopen this briefing.</li>';
      return;
    }
    list.innerHTML = items.map(it => `
      <li>
        <span class="cc-inv-dot"></span>
        <span class="cc-inv-name">${esc(it.name)}</span>
        <span class="cc-inv-cat">${esc(it.category || "")}</span>
      </li>`).join("");
  }

  const scenarios = ops.scenariosForFamilies(brief.stackFamilies || []);
  let activeIdx = 0;
  if (brief.focusFamily) {
    const p = ops.getOpsProfile(brief.focusFamily);
    if (p && p.scenario) {
      const i = scenarios.findIndex(s => s.id === p.scenario);
      if (i >= 0) activeIdx = i;
    }
  }

  function renderAlerts() {
    $("#cc-alert-count").textContent = scenarios.length;
    const list = $("#cc-alert-list");
    list.innerHTML = scenarios.map((s, i) => `
      <li class="cc-alert-item ${i === activeIdx ? "is-active" : ""}" data-idx="${i}">
        <span class="cc-sev cc-sev--${SEV_BY_INDEX[i % SEV_BY_INDEX.length]}"></span>
        <span class="cc-alert-body">
          <span class="cc-alert-title">${esc(s.title)}</span>
          <span class="cc-alert-meta">${(s.domains || []).map(d => esc(ops.DOMAIN_LABELS[d] || d)).join(" · ")}</span>
        </span>
      </li>`).join("");
    list.querySelectorAll(".cc-alert-item").forEach(el => {
      el.addEventListener("click", () => { activeIdx = +el.dataset.idx; renderCanvas(); renderAlerts(); syncPicker(); });
    });
  }

  function renderPicker() {
    const sel = $("#cc-scenario-picker");
    sel.innerHTML = scenarios.map((s, i) => `<option value="${i}">${esc(s.title)}</option>`).join("");
    sel.value = String(activeIdx);
    sel.addEventListener("change", () => { activeIdx = +sel.value; renderCanvas(); renderAlerts(); });
  }
  function syncPicker() {
    const sel = $("#cc-scenario-picker");
    if (sel) sel.value = String(activeIdx);
  }

  function renderCanvas() {
    const s = scenarios[activeIdx];
    if (!s) return;
    $("#cc-scn-title").textContent = s.title;
    $("#cc-scn-domains").innerHTML = (s.domains || [])
      .map(d => `<span class="cc-domain-tag">${esc(ops.DOMAIN_LABELS[d] || d)}</span>`).join("");
    $("#cc-scn-hypotheses").innerHTML = (s.hypotheses || []).map(h => `<li>${esc(h)}</li>`).join("");
    $("#cc-scn-evidence").innerHTML = (s.evidence || []).map(e => `<li>${esc(e)}</li>`).join("");
    $("#cc-scn-impact").textContent = s.impact || "—";
    $("#cc-scn-action").textContent = s.action || "—";
    const approve = $("#cc-approve");
    approve.classList.remove("is-done");
    approve.textContent = "Approve remediation";
  }

  const PILLAR_COLORS = { "ai-dc": "#0a60ff", workplaces: "#2dce5c", resilience: "#ff9000" };
  function renderPillars() {
    const wrap = $("#cc-pillars");
    const pillars = (brief.pillars && brief.pillars.length) ? brief.pillars : DEMO_BRIEF.pillars;
    wrap.innerHTML = pillars.map(p => {
      const color = PILLAR_COLORS[p.id] || "#02c8ff";
      return `<div class="cc-pillar ${p.covered ? "is-covered" : ""}" style="color:${color}">
        <span class="cc-pillar-dot" style="background:${color}"></span>
        <span class="cc-pillar-name" style="color:var(--cc-ink)">${esc(p.shortLabel || p.id)}</span>
        <span class="cc-pillar-status">${p.covered ? "Covered" : "Gap"}</span>
      </div>`;
    }).join("");
  }

  function renderGap() {
    const body = $("#cc-gap-body");
    const pkg = brief.cloudControlPackage;
    if (pkg && typeof pkg.pct === "number") {
      body.innerHTML = `
        <div class="cc-gap-pct">${pkg.pct}%</div>
        <div class="cc-gap-bar"><div class="cc-gap-fill" style="width:${Math.max(4, pkg.pct)}%"></div></div>
        <div>${esc(pkg.owned)}/${esc(pkg.total)} of the Cloud Control package in this plan.</div>`;
    } else {
      const hasCC = (brief.stackFamilies || []).includes("cloud-control");
      body.innerHTML = hasCC
        ? "Cloud Control is in the plan — the platform harness for these investigations."
        : "Add Cisco Cloud Control to the plan to unify these domains under one AgenticOps harness.";
    }
  }

  function wireButtons() {
    $("#cc-approve").addEventListener("click", () => {
      const b = $("#cc-approve");
      b.classList.add("is-done");
      b.textContent = "✓ Remediation dispatched (demo)";
    });
    $("#cc-copy-prompt").addEventListener("click", async () => {
      const s = scenarios[activeIdx];
      if (!s) return;
      const text = `AI Canvas investigation — ${s.title}\n\n${s.prompt}\n\nHypotheses:\n${(s.hypotheses || []).map(h => "- " + h).join("\n")}`;
      try {
        await navigator.clipboard.writeText(text);
        const b = $("#cc-copy-prompt");
        const orig = b.textContent; b.textContent = "✓ Copied";
        setTimeout(() => { b.textContent = orig; }, 1600);
      } catch (e) { /* clipboard blocked */ }
    });
    $("#cc-back").addEventListener("click", () => {
      if (params.get("from") === "cpn" && window.history.length > 1) window.history.back();
      else window.location.href = "cisco-portfolio-navigator.html";
    });
    const foc = brief.focusFamily && ops.getOpsProfile(brief.focusFamily);
    if (foc && foc.dcloud) $("#cc-dcloud").href = foc.dcloud;
  }

  renderAccount();
  renderInventory();
  renderPicker();
  renderAlerts();
  renderCanvas();
  renderPillars();
  renderGap();
  wireButtons();
})();
