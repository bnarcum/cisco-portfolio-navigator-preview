/**
 * Design Studio premium — tour, share, portfolio grid, validation UX
 */
(function () {
  "use strict";

  const TOUR_KEY = "cpn-ds-tour-v2";
  const ROOM_TYPE_LABELS = {
    boardroom: "Boardroom", conference: "Conference", huddle: "Huddle", training: "Training",
    executive: "Executive", teamsRoom: "Teams", zoomRoom: "Zoom", ctMediumDualDisplay: "Dual display",
    ctSmallCollab: "Small collab", divisible: "Divisible",
    smallRoom: "Small room", largeRoom: "Large room", largeRoomConfidence: "Large + confidence",
    auditorium: "Auditorium", focusRoom: "Focus", openDesk: "Open desk",
    deskEssentials: "Desk essentials", deskVoice: "Desk voice", deskHybrid: "Desk hybrid",
    deskAllInOne: "Desk all-in-one", huddleByod: "Huddle BYOD"
  };

  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function isDesignGenerated(design) {
    return !!(design?.intentPlan?.at || (design?.nodes?.length && design?.rooms?.length));
  }

  function scoreState(design, score) {
    if (!design?.nodes?.length) return { label: "—", cls: "ds-score idle", title: "Generate a draft to score" };
    if (!isDesignGenerated(design)) return { label: "Draft", cls: "ds-score idle", title: "Canvas not synced with brief — Generate Draft" };
    const roomCount = design.rooms?.length || 0;
    if (roomCount > 1 && score < 50) {
      return {
        label: `${roomCount} rooms`,
        cls: "ds-score good",
        title: `Portfolio of ${roomCount} collaboration spaces — open Room tab for per-space score`
      };
    }
    return {
      label: `${score}/100`,
      cls: score >= 80 ? "ds-score good" : score >= 50 ? "ds-score ok" : "ds-score low",
      title: roomCount ? `Design score · ${roomCount} room${roomCount === 1 ? "" : "s"}` : "Design completeness score"
    };
  }

  function staleState(studio) {
    const text = document.getElementById("ds-intent-text")?.value?.trim() || "";
    if (!text) return null;
    const INT = window.__DS_INTENT;
    if (!INT?.parseIntent) return null;
    const parsed = INT.parseIntent(text);
    const planned = parsed.roomMix.reduce((s, r) => s + r.count, 0);
    const existing = studio.design.rooms.length;
    const needs = planned > 0 && (existing === 0 || existing !== planned || !studio.design.intentPlan);
    if (!needs || studio.tab === "intent") return null;
    return { planned, existing, text: planned > 1
      ? `Brief calls for ${planned} rooms but canvas has ${existing}. Generate Draft to sync.`
      : "Brief changed — Generate Draft on Intent to refresh the canvas." };
  }

  function staleDismissKey(st, text) {
    return `${st.planned}:${st.existing}:${text.length}`;
  }

  function renderStaleBanner(studio) {
    const el = document.getElementById("ds-stale-banner");
    const status = document.getElementById("ds-stale-status");
    const st = staleState(studio);
    if (el) { el.hidden = true; el.innerHTML = ""; }
    if (!status) return;
    if (!st) { status.hidden = true; status.textContent = ""; return; }
    const brief = document.getElementById("ds-intent-text")?.value?.trim() || "";
    const dismissKey = staleDismissKey(st, brief);
    if (studio.staleBannerDismissed === dismissKey) { status.hidden = true; return; }
    status.hidden = false;
    status.innerHTML = `<span>${esc(st.text)}</span>
      <button type="button" class="ds-stale-link" data-action="sync">Sync</button>
      <button type="button" class="ds-stale-link ds-stale-dismiss" data-action="dismiss">Dismiss</button>`;
    status.querySelector("[data-action='sync']")?.addEventListener("click", () => {
      studio.setTab("intent");
      document.getElementById("ds-generate")?.focus();
    });
    status.querySelector("[data-action='dismiss']")?.addEventListener("click", () => {
      studio.staleBannerDismissed = dismissKey;
      status.hidden = true;
    });
  }

  function renderRoomMixEditor(studio, parsed) {
    const box = document.getElementById("ds-room-mix-editor");
    if (!box) return;
    const mix = studio.customRoomMix?.length ? studio.customRoomMix : (parsed?.roomMix || []);
    if (!mix.length) { box.hidden = true; box.innerHTML = ""; return; }
    const total = mix.reduce((s, r) => s + r.count, 0);
    box.hidden = false;
    box.innerHTML = `
      <div class="ds-room-mix-head"><strong>Room portfolio</strong><span>${total} room${total === 1 ? "" : "s"} total</span></div>
      <div class="ds-room-mix-grid">${mix.map((r, i) => `
        <label class="ds-room-mix-row">
          <span>${esc(ROOM_TYPE_LABELS[r.key] || r.key)}</span>
          <input type="number" min="0" max="48" value="${r.count}" data-mix-idx="${i}" aria-label="${esc(r.key)} count"/>
        </label>`).join("")}
      </div>
      <p class="ds-room-mix-hint">Adjust counts before <em>Generate Draft</em> — overrides parsed brief for room types only.</p>`;
    box.querySelectorAll("input[data-mix-idx]").forEach(inp => {
      inp.addEventListener("change", () => {
        const idx = parseInt(inp.dataset.mixIdx, 10);
        const val = Math.max(0, Math.min(48, parseInt(inp.value, 10) || 0));
        inp.value = val;
        const base = studio.customRoomMix?.length ? [...studio.customRoomMix] : mix.map(x => ({ ...x }));
        base[idx] = { ...base[idx], count: val };
        studio.customRoomMix = base.filter(x => x.count > 0);
        studio.refreshExplore?.();
      });
    });
  }

  function roomPortfolioGrid(studio) {
    const rooms = studio.design.rooms || [];
    if (!rooms.length) return "";
    const tpl = k => window.__DS_TEMPLATES?.ROOM_TEMPLATES?.[k];
    const counts = {};
    rooms.forEach(r => { counts[r.template] = (counts[r.template] || 0) + 1; });
    const summary = Object.entries(counts).map(([k, n]) => {
      const lbl = ROOM_TYPE_LABELS[k] || tpl(k)?.category || k;
      return `${n}× ${lbl}`;
    }).join(" · ");
    return `<p class="ds-portfolio-summary">${esc(summary)}</p>
    <div class="ds-portfolio-grid" role="list">${rooms.map((r, i) => {
      const t = tpl(r.template);
      const active = r.id === studio.activeRoomId ? " active" : "";
      const short = (ROOM_TYPE_LABELS[r.template] || t?.category || "Room").slice(0, 6);
      return `<button type="button" class="ds-portfolio-card${active}" data-room-id="${esc(r.id)}" role="listitem">
        <span class="ds-portfolio-idx">${i + 1}</span>
        <span class="ds-portfolio-type">${esc(short)}</span>
        <span class="ds-portfolio-name">${esc(r.name)}</span>
      </button>`;
    }).join("")}</div>`;
  }

  function renderRoomViewToggle(studio) {
    const bar = document.getElementById("ds-room-guide");
    if (!bar || studio.tab !== "room") return;
    let toggle = bar.querySelector("#ds-room-view-toggle");
    if (!toggle) {
      toggle = document.createElement("div");
      toggle.id = "ds-room-view-toggle";
      toggle.className = "ds-room-view-toggle";
      bar.querySelector(".ds-room-guide-head")?.appendChild(toggle);
    }
    toggle.innerHTML = `
      <button type="button" class="ds-view-btn${studio.roomView === "diagram" ? " active" : ""}" data-view="diagram">Diagram</button>
      <button type="button" class="ds-view-btn${studio.roomView === "walk" ? " active" : ""}" data-view="walk" title="3D walkthrough along your diagram">Walk</button>
      <button type="button" class="ds-view-btn${studio.roomView === "grid" ? " active" : ""}" data-view="grid">All ${studio.design.rooms.length} rooms</button>`;
    toggle.querySelectorAll(".ds-view-btn").forEach(b => {
      b.onclick = () => {
        const v = b.dataset.view;
        if (v === "walk") {
          studio.roomView = "walk";
          studio.openWalk?.();
        } else {
          window.__DS_WALK?.close?.();
          studio.roomView = v;
          studio.renderCanvas();
          studio.scheduleFitView?.();
        }
        renderRoomViewToggle(studio);
        if (studio.roomView === "diagram") requestAnimationFrame(() => studio.fitView());
      };
    });
  }

  function renderPortfolioOverlay(studio) {
    let layer = document.getElementById("ds-portfolio-overlay");
    if (studio.tab !== "room" || studio.roomView !== "grid" || !studio.design.rooms.length) {
      if (layer) layer.hidden = true;
      return;
    }
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "ds-portfolio-overlay";
      document.getElementById("ds-canvas-wrap")?.appendChild(layer);
    }
    layer.hidden = false;
    layer.innerHTML = `<div class="ds-portfolio-panel">
      <header><strong>Room portfolio</strong><span>${studio.design.rooms.length} collaboration spaces</span></header>
      ${roomPortfolioGrid(studio)}
    </div>`;
    layer.querySelectorAll("[data-room-id]").forEach(btn => {
      btn.onclick = () => {
        studio.roomView = "diagram";
        window.__DS_WALK?.close?.();
        studio.switchToRoom(btn.dataset.roomId);
        renderPortfolioOverlay(studio);
        renderRoomViewToggle(studio);
      };
    });
  }

  const TOUR_STEPS = [
    {
      center: true,
      text: "Design Studio turns a brief into a validated network and room design with real Cisco PIDs — Intent, Network, Room, then Quote.",
      before: (studio) => studio.setTab("intent")
    },
    {
      sel: "#ds-one-cisco-deck",
      place: "bottom",
      text: "Start from a One Cisco pillar or starter phrase. Parsed chips preview room mix and architecture before you generate.",
      before: (studio) => studio.setTab("intent")
    },
    {
      sel: "#ds-generate",
      place: "top",
      text: "Generate Draft builds the full topology and collaboration spaces. Quickstart loads a sample and opens the 3D walk.",
      before: (studio) => studio.setTab("intent")
    },
    {
      sel: "#ds-tabs",
      place: "bottom",
      text: "Network and Room tabs hold your diagrams. Drag stencils from Build, wire ports, and launch 3D Walk from the canvas toolbar.",
      before: (studio) => studio.setTab("network")
    },
    {
      sel: "#ds-sidebar-modes",
      place: "left",
      text: "Quote covers BOM, validation, and suggestions. Learn surfaces CVD guides and dCloud labs matched to your design.",
      before: (studio) => { studio.setTab("network"); studio.setSidebarMode("quote"); }
    },
    {
      sel: "#ds-export-ccw",
      place: "bottom",
      text: "Export to CCW when validation passes. Use Gallery for reference architectures anytime — re-run Tour from the header when you need a refresher.",
      before: (studio) => studio.setTab("intent")
    }
  ];

  let tourActive = false;
  let tourStepIdx = 0;
  let tourStudio = null;
  let tourUi = null;

  function ensureTourUi() {
    document.getElementById("ds-tour-overlay")?.remove();
    if (tourUi) return tourUi;
    const root = document.createElement("div");
    root.id = "ds-tour-root";
    root.innerHTML = `<div id="ds-tour-spotlight" aria-hidden="true"></div><div id="ds-tour-popover" role="dialog" aria-live="polite"></div>`;
    document.getElementById("design-studio")?.appendChild(root);
    const popover = root.querySelector("#ds-tour-popover");
    popover.addEventListener("click", (ev) => {
      const skip = ev.target.closest("[data-tour='skip']");
      const next = ev.target.closest("[data-tour='next']");
      if (skip) endTour(true);
      else if (next) runTour(tourStudio, tourStepIdx + 1);
    });
    window.addEventListener("resize", () => {
      if (tourActive) positionTourStep(TOUR_STEPS[tourStepIdx]);
    });
    tourUi = {
      root,
      spotlight: root.querySelector("#ds-tour-spotlight"),
      popover
    };
    return tourUi;
  }

  function endTour(completed) {
    tourActive = false;
    tourStepIdx = 0;
    tourStudio = null;
    if (completed) {
      try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) { /* ignore */ }
    }
    tourUi?.root.classList.remove("show");
    tourUi?.spotlight.classList.remove("show", "centered");
    tourUi?.popover.classList.remove("show", "center", "arrow-top", "arrow-bottom", "arrow-left", "arrow-right");
  }

  function positionTourStep(step) {
    const ui = ensureTourUi();
    const { spotlight, popover } = ui;
    popover.className = "";
    popover.style.visibility = "";

    if (!step?.sel || step.center) {
      spotlight.classList.remove("show");
      spotlight.classList.add("centered");
      popover.classList.add("center", "show");
      popover.innerHTML = renderTourCard(tourStepIdx);
      return;
    }

    spotlight.classList.remove("centered");
    const el = document.querySelector(step.sel);
    if (!el) {
      spotlight.classList.remove("show");
      popover.classList.add("center", "show");
      popover.innerHTML = renderTourCard(tourStepIdx);
      return;
    }

    const pad = 8;
    const placeRect = () => {
      const r = el.getBoundingClientRect();
      spotlight.style.top = `${Math.max(4, r.top - pad)}px`;
      spotlight.style.left = `${Math.max(4, r.left - pad)}px`;
      spotlight.style.width = `${Math.max(24, r.width + pad * 2)}px`;
      spotlight.style.height = `${Math.max(24, r.height + pad * 2)}px`;
      spotlight.classList.add("show");

      popover.innerHTML = renderTourCard(tourStepIdx);
      popover.style.visibility = "hidden";
      popover.classList.add("show");
      const pr = popover.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 14;
      let place = step.place;
      if (!place) {
        const room = { bottom: vh - r.bottom, top: r.top, right: vw - r.right, left: r.left };
        place = Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
      }
      let top;
      let left;
      if (place === "bottom") {
        top = r.bottom + gap;
        left = Math.max(12, Math.min(vw - pr.width - 12, r.left + r.width / 2 - 28));
        popover.classList.add("arrow-top");
      } else if (place === "top") {
        top = r.top - pr.height - gap;
        left = Math.max(12, Math.min(vw - pr.width - 12, r.left + r.width / 2 - 28));
        popover.classList.add("arrow-bottom");
      } else if (place === "left") {
        left = r.left - pr.width - gap;
        top = Math.max(12, Math.min(vh - pr.height - 12, r.top + r.height / 2 - 24));
        popover.classList.add("arrow-right");
      } else {
        left = r.right + gap;
        top = Math.max(12, Math.min(vh - pr.height - 12, r.top + r.height / 2 - 24));
        popover.classList.add("arrow-left");
      }
      top = Math.max(12, Math.min(vh - pr.height - 12, top));
      left = Math.max(12, Math.min(vw - pr.width - 12, left));
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.style.visibility = "";
    };

    if (el.getBoundingClientRect().top < 0 || el.getBoundingClientRect().bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setTimeout(placeRect, 280);
    } else {
      placeRect();
    }
  }

  function renderTourCard(step) {
    return `
      <span class="ds-tour-step">Step ${step + 1} of ${TOUR_STEPS.length}</span>
      <p>${esc(TOUR_STEPS[step].text)}</p>
      <div class="ds-tour-actions">
        <button type="button" class="ds-btn" data-tour="skip">Skip tour</button>
        <button type="button" class="ds-btn primary" data-tour="next">${step < TOUR_STEPS.length - 1 ? "Next" : "Done"}</button>
      </div>`;
  }

  function runTour(studio, step = 0) {
    if (step >= TOUR_STEPS.length) {
      endTour(true);
      return;
    }
    const s = TOUR_STEPS[step];
    tourActive = true;
    tourStepIdx = step;
    tourStudio = studio;
    if (s.before) {
      try { s.before(studio); } catch (e) { /* ignore */ }
    }
    const ui = ensureTourUi();
    ui.root.classList.add("show");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => positionTourStep(s));
    });
  }

  function validationPanelExtras(design, val, score) {
    const poe = val.poe || {};
    const pct = poe.budget > 0 ? Math.min(100, Math.round((poe.load / poe.budget) * 100)) : 0;
    const poeBar = poe.budget ? `
      <div class="ds-poe-gauge">
        <div class="ds-poe-gauge-head"><span>PoE budget</span><strong>${poe.load || 0}W / ${poe.budget}W</strong></div>
        <div class="ds-poe-track"><div class="ds-poe-fill${pct > 90 ? " warn" : ""}" style="width:${pct}%"></div></div>
        <span class="ds-poe-meta">${poe.headroom ?? 0}W headroom · collab switches</span>
      </div>` : "";
    const badges = [];
    if (design.intentPlan?.netKey === "snraCampus") badges.push("SNRA-aligned");
    if (design.rooms?.length > 1) badges.push(`${design.rooms.length} rooms`);
    if (score >= 80) badges.push("CCW-ready");
    badges.push("Real PIDs only");
    const badgeHtml = badges.length ? `<div class="ds-trust-badges">${badges.map(b => `<span>${esc(b)}</span>`).join("")}</div>` : "";
    const ccwReady = score >= 70 && !val.warnings.some(w => w.severity === "error");
    return { poeBar, badgeHtml, ccwReady };
  }

  function exportDesignBundle(studio) {
    const d = studio.design;
    const dl = window.__cpnV2?.helpers?.downloadBlob;
    if (!dl) { studio.toast("Export unavailable"); return; }
    const slug = (d.account || "design").replace(/[^\w-]+/g, "-");
    const json = JSON.stringify({
      format: "cpn-design-bundle", version: 1, exported: new Date().toISOString(),
      app: window.__cpnV2?.APP_VERSION, design: d
    }, null, 2);
    dl(`${slug}.cpn-design.json`, "application/json", json);
    studio.toast("Design bundle exported — share .cpn-design.json");
  }

  function importDesignBundle(studio, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const d = data.design || data;
        if (!d.nodes) throw new Error("Invalid bundle");
        studio.design = { ...studio.design, ...d, version: 4 };
        studio.activeRoomId = d.activeRoomId || d.rooms?.[0]?.id || null;
        studio.customRoomMix = null;
        studio.pushHistory();
        studio.render();
        studio.toast("Design imported from bundle");
      } catch (e) {
        studio.toast("Could not import bundle");
      }
    };
    reader.readAsText(file);
  }

  function exportCustomerSvg(studio) {
    studio.presentation = true;
    studio.el?.classList.add("ds-present-mode");
    studio.renderCanvas();
    studio.exportSvg();
    studio.presentation = false;
    studio.el?.classList.remove("ds-present-mode");
    studio.render();
    studio.toast("Customer SVG exported (clean view)");
  }

  function plannerSyncHint(studio) {
    const bom = studio.design.nodes?.length || 0;
    if (!bom) return;
    const v2 = window.__cpnV2;
    if (!v2?.phases?.readState) return;
    studio.toast(`Design saved · ${studio.design.rooms.length} rooms · use Import Stack to pull planner families into canvas`);
  }

  function renderCompare(studio) {
    const box = document.getElementById("ds-compare");
    if (!box) return;
    const nets = Object.keys(window.__DS_TEMPLATES?.NETWORK_TEMPLATES || {});
    box.innerHTML = `
      <div class="ds-compare-head"><strong>Compare architectures</strong><span>Side-by-side CVD options</span></div>
      <div class="ds-compare-row">
        <label>A<select id="ds-compare-a">${nets.map(k => `<option value="${k}">${esc(window.__DS_TEMPLATES.NETWORK_TEMPLATES[k].label)}</option>`).join("")}</select></label>
        <label>B<select id="ds-compare-b">${nets.map(k => `<option value="${k}"${k === "campusCollapsed" ? " selected" : ""}>${esc(window.__DS_TEMPLATES.NETWORK_TEMPLATES[k].label)}</option>`).join("")}</select></label>
      </div>
      <div id="ds-compare-out" class="ds-compare-out"></div>`;
    const refresh = () => {
      const a = document.getElementById("ds-compare-a")?.value;
      const b = document.getElementById("ds-compare-b")?.value;
      const ta = window.__DS_TEMPLATES?.NETWORK_TEMPLATES?.[a];
      const tb = window.__DS_TEMPLATES?.NETWORK_TEMPLATES?.[b];
      const out = document.getElementById("ds-compare-out");
      if (!out || !ta || !tb) return;
      out.innerHTML = `<div class="ds-compare-card"><strong>${esc(ta.label)}</strong><span>${ta.nodes?.length || 0} nodes</span>
        <a href="${esc(ta.cvdUrl || "#")}" target="_blank" rel="noopener">${esc(ta.cvd || "CVD")} ↗</a></div>
        <div class="ds-compare-card"><strong>${esc(tb.label)}</strong><span>${tb.nodes?.length || 0} nodes</span>
        <a href="${esc(tb.cvdUrl || "#")}" target="_blank" rel="noopener">${esc(tb.cvd || "CVD")} ↗</a></div>`;
    };
    document.getElementById("ds-compare-a")?.addEventListener("change", refresh);
    document.getElementById("ds-compare-b")?.addEventListener("change", refresh);
    refresh();
  }

  function highlightBomPid(studio, pid) {
    studio.highlightPid = pid;
    document.querySelectorAll("#ds-nodes .ds-node").forEach(el => {
      const node = studio.design.nodes.find(n => n.id === el.dataset.node);
      const np = node?.pid || window.__DS_STENCILS?.getDef?.(node?.stencilId, node?.canvas === "room" ? "room" : "network")?.pid;
      el.classList.toggle("ds-bom-highlight", pid && np === pid);
    });
  }

  function refresh(studio) {
    renderStaleBanner(studio);
    const INT = window.__DS_INTENT;
    const text = document.getElementById("ds-intent-text")?.value || "";
    if (INT?.parseIntent) renderRoomMixEditor(studio, INT.parseIntent(text));
    renderRoomViewToggle(studio);
    renderPortfolioOverlay(studio);
  }

  function $$ (sel, root) { return [...(root || document).querySelectorAll(sel)]; }

  window.__DS_PREMIUM = {
    scoreState, isDesignGenerated, staleState, refresh, renderStaleBanner, renderRoomMixEditor,
    renderRoomViewToggle, renderPortfolioOverlay,
    runTour,
    validationPanelExtras, exportDesignBundle, importDesignBundle, exportCustomerSvg,
    plannerSyncHint, renderCompare, highlightBomPid, roomPortfolioGrid
  };
})();
