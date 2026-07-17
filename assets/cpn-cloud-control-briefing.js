/* Cisco AI Canvas (demo) runtime.
   Reconstructs the AgenticOps generative-UI workspace: a board library, a
   dynamically generated widget board (summary, live chart, topology, evidence,
   actions), and a streaming multi-agent assistant conversation. Reads plan
   context handed off from the Portfolio Navigator; all telemetry is illustrative. */
(function () {
  "use strict";

  const ops = window.__cpnOps;
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const params = new URLSearchParams(location.search);
  const focusFamily = params.get("focus");

  const DEMO_BRIEF = {
    account: "Demo Account",
    focusFamily: focusFamily || null,
    stackFamilies: ["cloud-control", "room-systems", "webex-calling", "sdwan", "thousandeyes", "meraki-mx"],
    items: [
      { id: "cloud-control", name: "Cisco Cloud Control", category: "Networking" },
      { id: "room-systems", name: "Room Systems", category: "Collaboration" },
      { id: "webex-calling", name: "Webex Calling", category: "Collaboration" },
      { id: "sdwan", name: "Catalyst SD-WAN", category: "Networking" },
      { id: "thousandeyes", name: "ThousandEyes", category: "Observability" },
      { id: "meraki-mx", name: "Meraki MX", category: "Networking" }
    ]
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

  const scenarios = ops.scenariosForFamilies(brief.stackFamilies || []);
  let activeIdx = 0;
  if (brief.focusFamily) {
    const p = ops.getOpsProfile(brief.focusFamily);
    if (p && p.scenario) {
      const i = scenarios.findIndex(s => s.id === p.scenario);
      if (i >= 0) activeIdx = i;
    }
  }
  let timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* ── deterministic helpers ─────────────────────────────────────────── */
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function agentsFor(scn) {
    return (scn.domains || []).map(d => ops.DOMAIN_AGENTS[d]).filter(Boolean);
  }

  /* ── SVG widgets ───────────────────────────────────────────────────── */
  function sparklineSvg(scn) {
    const m = scn.metric || { peak: 10, baseline: 1, unit: "" };
    const W = 300, H = 120, pad = 8, n = 26;
    const rnd = seeded(scn.id);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let v;
      if (t < 0.66) v = m.baseline + (rnd() - 0.5) * Math.max(0.6, m.baseline * 0.5);
      else { const r = (t - 0.66) / 0.34; v = m.baseline + (m.peak - m.baseline) * (r * r) + (rnd() - 0.5) * m.peak * 0.08; }
      pts.push(Math.max(0, v));
    }
    const max = Math.max(m.peak * 1.15, ...pts);
    const x = i => pad + (i / (n - 1)) * (W - pad * 2);
    const y = v => H - pad - (v / max) * (H - pad * 2);
    const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(n - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
    const peakI = pts.indexOf(Math.max(...pts));
    return `
      <svg class="cc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="metric chart">
        <defs>
          <linearGradient id="cc-fill-${scn.id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#02c8ff" stop-opacity=".35"/>
            <stop offset="1" stop-color="#02c8ff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="rgba(255,255,255,.12)"/>
        <path d="${area}" fill="url(#cc-fill-${scn.id})"/>
        <path d="${line}" fill="none" stroke="#02c8ff" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="${x(peakI).toFixed(1)}" cy="${y(pts[peakI]).toFixed(1)}" r="4" fill="#ff4d6d"/>
      </svg>`;
  }

  function topologySvg(scn) {
    const t = scn.topology || { nodes: ["A", "B", "C"], degraded: 0 };
    const nodes = t.nodes;
    const W = 300, H = 130, r = 15, cy = 46;
    const gap = (W - 40) / (nodes.length - 1);
    let links = "";
    for (let i = 0; i < nodes.length - 1; i++) {
      const x1 = 20 + i * gap, x2 = 20 + (i + 1) * gap;
      const bad = i === t.degraded;
      links += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}"
        stroke="${bad ? "#ff4d6d" : "rgba(2,200,255,.5)"}" stroke-width="${bad ? 3 : 2}"
        ${bad ? 'stroke-dasharray="5 4"' : ""}>${bad ? '<animate attributeName="stroke-dashoffset" from="18" to="0" dur="0.8s" repeatCount="indefinite"/>' : ""}</line>`;
    }
    let circles = "";
    nodes.forEach((name, i) => {
      const cx = 20 + i * gap;
      const touchesBad = i === t.degraded || i === t.degraded + 1;
      circles += `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#131f36" stroke="${touchesBad ? "#ff4d6d" : "#02c8ff"}" stroke-width="2"/>
        <circle cx="${cx}" cy="${cy}" r="4" fill="${touchesBad ? "#ff4d6d" : "#7ee8ff"}"/>
        <text x="${cx}" y="${cy + r + 14}" text-anchor="middle" font-size="9" fill="#8ea6bd">${esc(name.length > 12 ? name.slice(0, 11) + "…" : name)}</text>`;
    });
    return `<svg class="cc-topo" viewBox="0 0 ${W} ${H}" role="img" aria-label="topology">${links}${circles}</svg>`;
  }

  /* ── widget cards ──────────────────────────────────────────────────── */
  function widget(icon, title, bodyEl, opts) {
    opts = opts || {};
    const w = el("div", "cc-widget" + (opts.wide ? " cc-widget--wide" : ""));
    const head = el("div", "cc-w-head",
      `<span class="cc-w-icon">${icon}</span><span class="cc-w-title">${esc(title)}</span>` +
      `<span class="cc-w-gen">✦ generated</span><span class="cc-w-menu">⋯</span>`);
    w.appendChild(head);
    if (typeof bodyEl === "string") w.insertAdjacentHTML("beforeend", bodyEl);
    else w.appendChild(bodyEl);
    return w;
  }

  function renderBoard() {
    const scn = scenarios[activeIdx];
    const board = $("#cc-board");
    board.innerHTML = "";
    if (!scn) return;

    $("#cc-board-title").textContent = scn.title;
    $("#cc-board-sev").className = "cc-board-sev sev--" + (scn.severity || "warning");
    const status = $("#cc-board-status");
    status.textContent = "Investigating";
    status.className = "cc-board-status";

    // 1) Investigation summary (wide)
    const domains = (scn.domains || []).map(d =>
      `<span class="cc-domain-tag">${esc(ops.DOMAIN_LABELS[d] || d)}</span>`).join("");
    board.appendChild(widget("◎", "Investigation summary",
      `<div class="cc-domains">${domains}</div>
       <div class="cc-sum-impact"><strong>Impact:</strong> ${esc(scn.impact || "—")}</div>`,
      { wide: true }));

    // 2) Live metric chart
    const m = scn.metric || {};
    board.appendChild(widget("📈", m.label || "Live metric",
      sparklineSvg(scn) +
      `<div class="cc-chart-meta"><span>baseline ${esc(m.baseline)}${esc(m.unit || "")}</span>
       <span class="cc-chart-peak">peak ${esc(m.peak)}${esc(m.unit || "")}</span></div>`));

    // 3) Topology map
    board.appendChild(widget("🗺", "Correlated topology",
      topologySvg(scn) +
      `<div class="cc-topo-legend"><b>—— degraded path</b> · other links healthy</div>`));

    // 4) Hypotheses
    const hyp = (scn.hypotheses || []).map((h, i) =>
      `<li><span class="cc-num">${i + 1}</span><span>${esc(h)}</span></li>`).join("");
    board.appendChild(widget("❓", "Ranked hypotheses", `<ul class="cc-list">${hyp}</ul>`));

    // 5) Evidence
    const ev = (scn.evidence || []).map(e => {
      const [src, ...rest] = e.split(":");
      const body = rest.join(":").trim();
      return `<li><span class="cc-check">✓</span><span>${esc(body || src)}<span class="cc-ev-src">${esc(body ? src : "agent finding")}</span></span></li>`;
    }).join("");
    board.appendChild(widget("🔎", "Evidence gathered by agents", `<ul class="cc-list">${ev}</ul>`));

    // 6) Recommended action (wide)
    const action = widget("⚡", "Recommended action",
      `<p class="cc-action-text">${esc(scn.action || "—")}</p>
       <div class="cc-action-btns">
         <button type="button" class="cc-btn cc-btn--primary" id="cc-approve">Approve &amp; execute</button>
         <button type="button" class="cc-btn" id="cc-copy-prompt">Copy AI Canvas prompt</button>
       </div>`, { wide: true });
    board.appendChild(action);

    action.querySelector("#cc-approve").addEventListener("click", () => {
      const b = action.querySelector("#cc-approve");
      b.classList.add("is-done"); b.textContent = "✓ Executed (demo)";
      status.textContent = "Resolved"; status.classList.add("is-resolved");
      addMessage({ kind: "agent", agent: agentsFor(scn)[0] || ops.DOMAIN_AGENTS.network,
        status: "done", body: "Remediation executed. Path restored and outcome captured — context preserved on this board." });
    });
    action.querySelector("#cc-copy-prompt").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(`AI Canvas — ${scn.title}\n\n${scn.prompt}`);
        const b = action.querySelector("#cc-copy-prompt"); const o = b.textContent;
        b.textContent = "✓ Copied"; setTimeout(() => { b.textContent = o; }, 1500);
      } catch (e) { /* clipboard blocked */ }
    });
  }

  /* ── assistant conversation ────────────────────────────────────────── */
  function messageNode(msg) {
    const wrap = el("div", "cc-msg" + (msg.kind === "user" ? " cc-msg--user" : ""));
    if (msg.kind === "user") {
      wrap.appendChild(el("div", "cc-msg-head",
        `<span class="cc-msg-badge cc-av--user" style="background:#c7d6e6">YOU</span><span class="cc-msg-name">Operator</span>`));
    } else {
      const a = msg.agent || ops.DOMAIN_AGENTS.network;
      const st = msg.status === "working"
        ? `<span class="cc-msg-status is-working"><span class="dot"></span>Investigating</span>`
        : `<span class="cc-msg-status"><span class="dot"></span>Done</span>`;
      wrap.appendChild(el("div", "cc-msg-head",
        `<span class="cc-msg-badge" style="background:${a.color}">${esc(a.short)}</span><span class="cc-msg-name">${esc(a.name)}</span>${st}`));
    }
    wrap.appendChild(el("div", "cc-msg-body", msg.typing
      ? `<span class="cc-typing"><span></span><span></span><span></span></span>` : esc(msg.body)));
    return wrap;
  }

  function addMessage(msg) {
    const thread = $("#cc-thread");
    const node = messageNode(msg);
    thread.appendChild(node);
    thread.scrollTop = thread.scrollHeight;
    return node;
  }

  function runConversation() {
    clearTimers();
    const scn = scenarios[activeIdx];
    const thread = $("#cc-thread");
    thread.innerHTML = "";
    if (!scn) return;

    addMessage({ kind: "user", body: scn.question || `Investigate: ${scn.title}` });

    const agents = agentsFor(scn);
    const evidence = scn.evidence || [];
    // Attribute each evidence line to the agent whose domain matches its source.
    const SRC_DOMAIN = [
      [/thousandeyes|catalyst|meraki|sd-?wan|\bmx\b|interface|dns|wan|path|circuit/i, "network"],
      [/control hub|webex|roomos|codec|calling|meeting/i, "collaboration"],
      [/xdr|firewall|\bise\b|duo|threat|c2|reputation/i, "security"],
      [/nexus|intersight|gpu|fabric|ecn|leaf|spine|rdma/i, "compute"],
      [/fso|splunk|otel|apm|rum|telemetry|agent at|unmanaged/i, "observability"]
    ];
    const pickAgent = (line) => {
      for (const [re, dom] of SRC_DOMAIN) {
        if (re.test(line) && (scn.domains || []).includes(dom)) return ops.DOMAIN_AGENTS[dom];
      }
      return null;
    };
    const steps = evidence.map((e, i) => ({
      agent: pickAgent(e) || agents[i % Math.max(1, agents.length)] || ops.DOMAIN_AGENTS.network,
      body: e
    }));

    let delay = 500;
    // orchestrator ack
    timers.push(setTimeout(() => addMessage({ kind: "agent",
      agent: { name: "AI Canvas", short: "✦", color: "#02c8ff" }, status: "working",
      body: `Spinning up ${agents.length} agent${agents.length > 1 ? "s" : ""} across ${(scn.domains || []).map(d => ops.DOMAIN_LABELS[d]).join(", ")}. Building your board…` }), delay));
    delay += 1100;

    steps.forEach((s) => {
      timers.push(setTimeout(() => {
        const t = addMessage({ kind: "agent", agent: s.agent, status: "working", typing: true });
        timers.push(setTimeout(() => {
          t.replaceWith(messageNode({ kind: "agent", agent: s.agent, status: "done", body: s.body }));
          $("#cc-thread").scrollTop = $("#cc-thread").scrollHeight;
        }, 900));
      }, delay));
      delay += 1500;
    });

    timers.push(setTimeout(() => addMessage({ kind: "agent",
      agent: { name: "AI Canvas", short: "✦", color: "#02c8ff" }, status: "done",
      body: `Root cause correlated. I've placed a recommended action on the board for your approval.` }), delay + 200));
  }

  /* ── left rail + presence ──────────────────────────────────────────── */
  function renderPresence() {
    const scn = scenarios[activeIdx] || {};
    const wrap = $("#cc-presence");
    let html = `<span class="cc-av cc-av--user" title="You">JS</span>`;
    agentsFor(scn).forEach(a => {
      html += `<span class="cc-av" style="background:${a.color}" title="${esc(a.name)}">${esc(a.short)}</span>`;
    });
    wrap.innerHTML = html;
  }

  function renderBoards() {
    const list = $("#cc-boards");
    list.innerHTML = scenarios.map((s, i) =>
      `<li class="cc-board-item ${i === activeIdx ? "is-active" : ""}" data-idx="${i}">
        <span class="cc-board-sevdot sev--${s.severity || "warning"}"></span>
        <span class="cc-board-item-txt">${esc(s.title)}</span>
      </li>`).join("");
    list.querySelectorAll(".cc-board-item").forEach(node => {
      node.addEventListener("click", () => { activeIdx = +node.dataset.idx; switchBoard(); });
    });
  }

  function renderEstate() {
    const items = brief.items || [];
    $("#cc-inv-items").textContent = items.length;
    $("#cc-inv-families").textContent = (brief.stackFamilies || []).length;
    const list = $("#cc-estate-list");
    if (!items.length) {
      list.innerHTML = '<li class="cc-empty">No products in scope. Add products in the Portfolio Navigator, then reopen AI Canvas.</li>';
      return;
    }
    list.innerHTML = items.slice(0, 10).map(it =>
      `<li><span class="cc-estate-dot"></span><span class="cc-estate-name">${esc(it.name)}</span></li>`).join("");
  }

  function switchBoard() {
    renderBoards();
    renderPresence();
    renderBoard();
    runConversation();
  }

  function wire() {
    $("#cc-account").textContent = brief.account || "Unnamed Account";
    $("#cc-back").addEventListener("click", () => {
      if (params.get("from") === "cpn" && window.history.length > 1) window.history.back();
      else window.location.href = "cisco-portfolio-navigator.html";
    });
    $("#cc-composer").addEventListener("submit", e => {
      e.preventDefault();
      const input = $("#cc-input");
      const q = input.value.trim();
      if (!q) return;
      input.value = "";
      addMessage({ kind: "user", body: q });
      const scn = scenarios[activeIdx] || {};
      const agent = agentsFor(scn)[0] || ops.DOMAIN_AGENTS.network;
      const t = addMessage({ kind: "agent", agent, status: "working", typing: true });
      timers.push(setTimeout(() => {
        t.replaceWith(messageNode({ kind: "agent", agent, status: "done",
          body: `Correlating that against the ${esc(scn.title || "current investigation")} board. I'll surface any new widget with the evidence I find. (Demo response.)` }));
        $("#cc-thread").scrollTop = $("#cc-thread").scrollHeight;
      }, 1100));
    });
  }

  renderEstate();
  wire();
  switchBoard();
})();
