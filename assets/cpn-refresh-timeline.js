/**
 * Refresh Timeline — EOS/EOL lifecycle HUD (matches acquisitions signal map).
 * Call CPN_RefreshTimeline.init(ctx) from boot, then build().
 */
(function () {
  "use strict";

  const TL = {
    zoom: 1.0,
    minZoom: 0.2,
    maxZoom: 6,
    onlyStack: false,
    families: new Set(),
    mainCat: null,
    yearSpan: 0,
    startY: 0,
    endY: 0,
    hoverId: null,
  };

  const MAIN_CAT_ORDER = ["networking", "security", "collaboration", "computing", "observability"];
  const MAIN_CAT_LABELS = {
    networking: "Networking",
    security: "Security",
    collaboration: "Collaboration",
    computing: "Computing",
    observability: "Observability",
  };

  const TL_BASE_PX_PER_YEAR = 90;
  const TL_LABEL_W = 222;
  const TL_GAP = 14;
  const TL_PAD_R = 22;

  const DECADE_COLORS = ["#02c8ff", "#6b8cff", "#a86bff", "#ff9000", "#2dce5c", "#ef4444"];

  let CTX = null;
  const $ = (s, r = document) => r.querySelector(s);

  function escapeHtml(s) {
    if (CTX?.escapeHtml) return CTX.escapeHtml(s);
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function getProducts() {
    return CTX?.getProducts?.() || [];
  }

  function getStack() {
    return CTX?.getStack?.() || new Set();
  }

  function catColor(cat) {
    return CTX?.catColor?.(cat) || "#02C8FF";
  }

  function nodeById(id) {
    return CTX?.nodeById?.[id] || null;
  }

  function productVisibleInTimeline(p) {
    if (CTX?.productVisibleInTimeline) return CTX.productVisibleInTimeline(p);
    return Boolean(p);
  }

  function showProductDetail(id, opts = {}) {
    window.__cpnOutcomeCard?.hide?.();
    if (typeof CTX?.showProductDetail === "function") CTX.showProductDetail(id, opts);
    else if (typeof window.showProductDetail === "function") window.showProductDetail(id, opts);
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  const MONTH_MAP = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  function parseFuzzyDate(s) {
    if (!s || typeof s !== "string") return null;
    const t = s.trim();
    if (!t || /^TBD\b/i.test(t)) return null;
    let m;
    if ((m = t.match(/^~\s*(\d{4})$/))) return new Date(+m[1], 5, 30);
    if ((m = t.match(/^~\s*(\d{4})\s*-\s*(\d{4})$/)))
      return new Date(Math.round((+m[1] + +m[2]) / 2), 5, 30);
    if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))
      return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = t.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/))) {
      const mon = MONTH_MAP[m[1].toLowerCase()];
      if (mon != null) return new Date(+m[3], mon, +m[2]);
    }
    if ((m = t.match(/^([A-Za-z]+)\s+(\d{4})$/))) {
      const mon = MONTH_MAP[m[1].toLowerCase()];
      if (mon != null) return new Date(+m[2], mon, 1);
    }
    if ((m = t.match(/^(\d{4})$/))) return new Date(+m[1], 0, 1);
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatMilestoneDate(s) {
    const d = parseFuzzyDate(s);
    if (!d) return s || "TBD";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (/^\d{4}$/.test(String(s).trim())) return String(d.getFullYear());
    return `${d.getFullYear()} - ${months[d.getMonth()]}`;
  }

  function packIntoLanes(blocks) {
    const safe = blocks.filter(b => Number.isFinite(b.left) && Number.isFinite(b.right));
    const sorted = [...safe].sort((a, b) => a.left - b.left);
    const lanes = [];
    sorted.forEach(b => {
      let lane = -1;
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] <= b.left + 0.05) { lane = i; break; }
      }
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = b.right;
      b.lane = lane;
    });
    return lanes.length;
  }

  function fitTimelineZoom() {
    const canvas = $("#tl-canvas");
    if (!canvas || TL.yearSpan <= 0) return 1;
    const trackPx = canvas.clientWidth - TL_LABEL_W - TL_GAP - TL_PAD_R;
    if (trackPx <= 0) return 1;
    return Math.max(0.05, trackPx / (TL.yearSpan * TL_BASE_PX_PER_YEAR));
  }

  function innerWidthPx() {
    const dataW = TL.yearSpan * TL_BASE_PX_PER_YEAR * TL.zoom;
    return TL_LABEL_W + TL_GAP + dataW + TL_PAD_R;
  }

  function productMatchesMainCat(p) {
    if (!TL.mainCat) return true;
    return nodeById(p.family)?.category === TL.mainCat;
  }

  function updateTimelineMainCatBtn() {
    const btn = $("#tl-cat-btn");
    if (!btn) return;
    const label = TL.mainCat ? (MAIN_CAT_LABELS[TL.mainCat] || TL.mainCat) : "All portfolios";
    btn.textContent = `${label} ▾`;
    btn.setAttribute("aria-label", `Filter by portfolio: ${label}`);
  }

  function timelineFamiliesForFilter() {
    const n = nodeById(famId);
    if (!n) return "";
    const checked = TL.families.has(famId) ? "checked" : "";
    return `<label class="fac-row"><input type="checkbox" data-fam="${famId}" ${checked}>
      <span class="ld" style="width:7px;height:7px;border-radius:50%;background:${catColor(n.category)};flex-shrink:0"></span>
      ${escapeHtml(n.name)}</label>`;
  }

  function timelineFamilyCheckboxRow(famId) {
    const stack = getStack();
    const ids = new Set();
    getProducts().forEach(p => {
      if (TL.onlyStack && !stack.has(p.id) && !stack.has(p.family)) return;
      if (!productVisibleInTimeline(p)) return;
      if (!productMatchesMainCat(p)) return;
      ids.add(p.family);
    });
    return [...ids].sort((a, b) => (nodeById(a)?.name || "").localeCompare(nodeById(b)?.name || ""));
  }

  function updateTimelineFamilyBtn() {
    const tlFamBtn = $("#tl-fam-btn");
    const tlFamClr = $("#tl-fam-clr");
    if (!tlFamBtn) return;
    const n = TL.families.size;
    if (n === 0) tlFamBtn.textContent = "All families ▾";
    else if (n === 1) {
      const id = [...TL.families][0];
      tlFamBtn.textContent = (nodeById(id)?.name || id) + " ▾";
    } else tlFamBtn.textContent = `${n} families ▾`;
    if (tlFamClr) tlFamClr.hidden = n === 0;
  }

  function populateTimelineFamilyList(q = "") {
    const tlFamList = $("#tl-fam-list");
    if (!tlFamList) return;
    const query = q.trim().toLowerCase();
    const famIds = timelineFamiliesForFilter();
    let html = "";

    if (!query) {
      const byCat = {};
      famIds.forEach(famId => {
        const n = nodeById(famId);
        if (!n) return;
        const cat = n.category || "other";
        (byCat[cat] = byCat[cat] || []).push(famId);
      });
      const cats = [
        ...MAIN_CAT_ORDER.filter(c => byCat[c]?.length),
        ...Object.keys(byCat).filter(c => !MAIN_CAT_ORDER.includes(c)),
      ];
      html = cats.map(cat => {
        const label = MAIN_CAT_LABELS[cat] || cat;
        const rows = byCat[cat]
          .sort((a, b) => (nodeById(a)?.name || "").localeCompare(nodeById(b)?.name || ""))
          .map(timelineFamilyCheckboxRow)
          .join("");
        return `<div class="tl-fam-grp-hdr">${escapeHtml(label)}</div>${rows}`;
      }).join("");
    } else {
      html = famIds.map(famId => {
        const n = nodeById(famId);
        if (!n || !n.name.toLowerCase().includes(query)) return "";
        return timelineFamilyCheckboxRow(famId);
      }).join("");
    }

    tlFamList.innerHTML = html ||
      `<div style="font-size:11px;color:var(--subtle);padding:6px 2px">No matching families</div>`;
    tlFamList.querySelectorAll("input[data-fam]").forEach(inp => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.fam;
        if (inp.checked) TL.families.add(id);
        else TL.families.delete(id);
        updateTimelineFamilyBtn();
        renderTimeline();
      });
    });
  }

  function updateStatsTicker(totalShown, famCount, eolCount, eosCount) {
    const el = $("#tl-stats-ticker");
    if (!el) return;
    el.innerHTML =
      `Showing <strong>${totalShown}</strong> product${totalShown !== 1 ? "s" : ""}` +
      ` across <strong>${famCount}</strong> famil${famCount !== 1 ? "ies" : "y"}` +
      ` · <span class="tl-stat-eol"><strong>${eolCount}</strong> EOL</span>` +
      ` · <span class="tl-stat-eos"><strong>${eosCount}</strong> EOS</span>`;
  }

  function renderDecadeBands(startY, endY, startMs, totalMs, dataW) {
    const layer = $("#tl-layer-decades");
    if (!layer) return;
    layer.innerHTML = "";
    layer.style.width = `${dataW}px`;
    layer.style.left = `${TL_LABEL_W + TL_GAP}px`;
    const firstDecade = Math.floor(startY / 10) * 10;
    let colorIdx = 0;
    for (let d = firstDecade; d <= endY; d += 10) {
      const leftPct = ((new Date(d, 0, 1).getTime() - startMs) / totalMs) * 100;
      const rightPct = ((new Date(Math.min(endY, d + 10), 0, 1).getTime() - startMs) / totalMs) * 100;
      if (rightPct <= 0 || leftPct >= 100) continue;
      const band = document.createElement("div");
      band.className = "tl-decade-band";
      band.style.left = `${Math.max(0, leftPct)}%`;
      band.style.width = `${Math.min(100, rightPct) - Math.max(0, leftPct)}%`;
      band.style.setProperty("--tl-decade-color", DECADE_COLORS[colorIdx % DECADE_COLORS.length]);
      const lbl = document.createElement("div");
      lbl.className = "tl-decade-lbl";
      lbl.textContent = `${d}s`;
      lbl.style.left = "8px";
      lbl.style.maxWidth = "calc(100% - 16px)";
      lbl.title = `${d}–${Math.min(d + 9, endY)}`;
      band.appendChild(lbl);
      layer.appendChild(band);
      colorIdx += 1;
    }
  }

  function renderMinimap(products, startMs, totalMs) {
    const track = $("#tl-minimap-track");
    const dots = $("#tl-minimap-dots");
    const vp = $("#tl-minimap-viewport");
    const labels = $("#tl-minimap-labels");
    if (!track || !dots) return;

    track.setAttribute("aria-valuemin", String(TL.startY));
    track.setAttribute("aria-valuemax", String(TL.endY));

    if (labels) {
      labels.innerHTML =
        `<span>${TL.startY}</span><span>${TL.endY}</span>`;
    }

    dots.innerHTML = "";
    const w = track.clientWidth || 400;
    products.forEach(p => {
      let anchor = parseFuzzyDate(p.eolDate) || parseFuzzyDate(p.eosDate);
      if (!anchor && p.status === "current") anchor = new Date();
      if (!anchor) return;
      const pct = Math.max(0, Math.min(1, (anchor.getTime() - startMs) / totalMs));
      const dot = document.createElement("div");
      dot.className = `tl-mini-dot ${p.status}`;
      dot.style.left = `${pct * 100}%`;
      dots.appendChild(dot);
    });

    const canvas = $("#tl-canvas");
    if (!canvas || !vp) return;
    const innerW = innerWidthPx();
    const ratio = w / Math.max(1, innerW);
    vp.style.width = `${Math.max(24, canvas.clientWidth * ratio)}px`;
    vp.style.left = `${canvas.scrollLeft * ratio}px`;

    const center = canvas.scrollLeft + canvas.clientWidth / 2;
    const trackOffset = TL_LABEL_W + TL_GAP;
    const dataW = TL.yearSpan * TL_BASE_PX_PER_YEAR * TL.zoom;
    const xWithin = center - trackOffset;
    const ratioYear = dataW > 0 ? xWithin / dataW : 0;
    const currentYear = Math.round(TL.startY + ratioYear * TL.yearSpan);
    track.setAttribute(
      "aria-valuenow",
      String(Math.max(TL.startY, Math.min(TL.endY, currentYear)))
    );
  }

  function showMinimapScan(clientX) {
    const track = $("#tl-minimap-track");
    const scan = $("#tl-minimap-scan");
    if (!track || !scan || prefersReducedMotion()) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    scan.style.left = `${pct * 100}%`;
    scan.classList.add("show");
  }

  function hideMinimapScan() {
    $("#tl-minimap-scan")?.classList.remove("show");
  }

  function scrubMinimap(clientX) {
    const track = $("#tl-minimap-track");
    const canvas = $("#tl-canvas");
    if (!track || !canvas) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const innerW = innerWidthPx();
    const maxScroll = Math.max(0, innerW - canvas.clientWidth);
    canvas.scrollLeft = pct * maxScroll;
    renderMinimapFromScroll();
    showMinimapScan(clientX);
  }

  function renderMinimapFromScroll() {
    const vp = $("#tl-minimap-viewport");
    const track = $("#tl-minimap-track");
    const canvas = $("#tl-canvas");
    if (!vp || !track || !canvas) return;
    const w = track.clientWidth || 400;
    const innerW = innerWidthPx();
    const ratio = w / Math.max(1, innerW);
    vp.style.width = `${Math.max(24, canvas.clientWidth * ratio)}px`;
    vp.style.left = `${canvas.scrollLeft * ratio}px`;
  }

  function setReadout(product) {
    const readout = $("#tl-readout");
    if (!readout) return;
    if (!product) {
      readout.hidden = true;
      TL.hoverId = null;
      readout.querySelectorAll(".tl-block-active").forEach(el => el.classList.remove("tl-block-active"));
      return;
    }
    TL.hoverId = product.id;
    readout.hidden = false;
    const statusEl = $("#tl-readout-status");
    const nameEl = $("#tl-readout-name");
    const metaEl = $("#tl-readout-meta");
    const fam = nodeById(product.family);
    if (statusEl) {
      statusEl.className = product.status;
      statusEl.textContent = product.status === "current" ? "Current"
        : product.status === "eos" ? "End of Sale" : "End of Life";
    }
    if (nameEl) nameEl.textContent = product.name;
    if (metaEl) {
      const parts = [fam?.name || product.family];
      if (product.eosDate) parts.push(`EOS ${formatMilestoneDate(product.eosDate)}`);
      if (product.eolDate) parts.push(`EOL ${formatMilestoneDate(product.eolDate)}`);
      metaEl.textContent = parts.join(" · ");
    }
    const inner = $("#tl-inner");
    inner?.querySelectorAll(".tl-block-active").forEach(el => el.classList.remove("tl-block-active"));
    inner?.querySelector(`.tl-block[data-id="${CSS.escape(product.id)}"]`)?.classList.add("tl-block-active");
  }

  function renderTimeline() {
    const inner = $("#tl-inner");
    if (!inner) return;
    const canvas = $("#tl-canvas");
    const now = new Date();
    const stack = getStack();

    const visibleProducts = getProducts().filter(p => {
      if (TL.onlyStack && !stack.has(p.id) && !stack.has(p.family)) return false;
      if (!productMatchesMainCat(p)) return false;
      if (TL.families.size > 0 && !TL.families.has(p.family)) return false;
      return productVisibleInTimeline(p);
    });

    let startY = now.getFullYear() - 5;
    let endY = now.getFullYear() + 6;
    visibleProducts.forEach(p => {
      for (const s of [p.eosDate, p.eolDate]) {
        const d = parseFuzzyDate(s);
        if (!d) continue;
        const y = d.getFullYear();
        if (y < startY) startY = y;
        if (y + 1 > endY) endY = y + 1;
      }
    });

    TL.startY = startY;
    TL.endY = endY;
    TL.yearSpan = endY - startY;
    const fitZ = fitTimelineZoom();
    TL.minZoom = Math.min(1, fitZ);
    if (TL.zoom < TL.minZoom) TL.zoom = TL.minZoom;

    const dataW = TL.yearSpan * TL_BASE_PX_PER_YEAR * TL.zoom;
    const innerW = TL_LABEL_W + TL_GAP + dataW + TL_PAD_R;
    inner.style.width = innerW + "px";

    const zoomOutBtn = $("#tl-zoom-out");
    if (zoomOutBtn) zoomOutBtn.disabled = TL.zoom <= TL.minZoom + 0.001;
    $("#tl-zoom-lvl").textContent = Math.round(TL.zoom * 100) + "%";
    $("#tl-zoom-in").disabled = TL.zoom >= TL.maxZoom - 0.001;

    const totalMs = (endY - startY) * 365.25 * 86400e3;
    const startMs = new Date(startY, 0, 1).getTime();
    const xFromDate = (s) => {
      const d = parseFuzzyDate(s);
      if (!d) return null;
      return Math.max(0, Math.min(100, ((d.getTime() - startMs) / totalMs) * 100));
    };

    const fams = {};
    visibleProducts.forEach(p => {
      (fams[p.family] = fams[p.family] || []).push(p);
    });

    const yearStep = TL.zoom < 1 ? 2
      : TL.zoom < 2.5 ? 1
        : TL.zoom < 4 ? 0.5
          : 0.25;
    const ticks = [];
    for (let y = startY; y <= endY; y += yearStep) {
      const pct = ((new Date(y, 0, 1).getTime() - startMs) / totalMs) * 100;
      const isMajor = Math.abs(y - Math.round(y)) < 0.01;
      ticks.push({ y, pct, label: isMajor ? String(Math.round(y)) : "", major: isMajor });
    }
    const todayPct = ((now.getTime() - startMs) / totalMs) * 100;

    const axisHtml = `<div class="tl-axis">
      <div class="tl-axis-lbl"></div>
      <div class="tl-axis-track">
        ${ticks.map(t => `<div class="tl-axis-tick ${t.major ? "major" : ""}" style="left:${t.pct}%">${t.label}</div>`).join("")}
        <div class="tl-axis-today" style="left:${todayPct}%"></div>
      </div>
    </div>`;

    const rowHtml = Object.entries(fams)
      .sort((a, b) => (nodeById(a[0])?.name || "").localeCompare(nodeById(b[0])?.name || ""))
      .map(([famId, prods]) => {
        const n = nodeById(famId);
        if (!n) return "";
        const blocks = prods.map(p => {
          let left = null;
          let right = null;
          let unknownLeft = false;
          let unknownRight = false;
          if (p.status === "current") {
            left = xFromDate(new Date(now.getFullYear() - 2, 0, 1).toISOString());
            right = 100;
          } else {
            const eosX = xFromDate(p.eosDate);
            const eolX = xFromDate(p.eolDate);
            if (eosX != null && eolX != null) {
              left = eosX;
              right = eolX;
            } else if (eosX != null) {
              left = eosX;
              right = Math.min(100, eosX + 12);
              unknownRight = true;
            } else if (eolX != null) {
              right = eolX;
              left = Math.max(0, eolX - 12);
              unknownLeft = true;
            } else {
              left = Math.max(0, todayPct - 4);
              right = Math.min(100, todayPct + 4);
              unknownLeft = unknownRight = true;
            }
          }
          if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
          return {
            p, left, right: Math.max(right, left + 1.2),
            unknownLeft, unknownRight,
          };
        }).filter(Boolean);

        const laneCount = packIntoLanes(blocks);
        const laneH = 18;
        const laneGap = 2;
        const trackH = laneCount * laneH + (laneCount - 1) * laneGap + 4;
        const trackPx = dataW;

        const blocksHtml = blocks.map(b => {
          const widthPct = b.right - b.left;
          const widthPx = widthPct / 100 * trackPx;
          const narrow = widthPx < 28;
          const top = b.lane * (laneH + laneGap);
          const label = narrow ? "" : escapeHtml(b.p.name);
          const unkCls = (b.unknownLeft && b.unknownRight) ? " unknown-both"
            : b.unknownLeft ? " unknown-left"
              : b.unknownRight ? " unknown-right"
                : "";
          const tip = `${b.p.name} — ${b.p.status.toUpperCase()}` +
            `${b.p.eosDate ? " · EOS " + b.p.eosDate : ""}` +
            `${b.p.eolDate ? " · EOL " + b.p.eolDate : ""}`;
          return `<div class="tl-block ${b.p.status}${narrow ? " narrow" : ""}${unkCls}${TL.hoverId === b.p.id ? " tl-block-active" : ""}"
            data-id="${escapeHtml(b.p.id)}"
            tabindex="0"
            role="button"
            style="left:${b.left}%;width:${widthPct}%;top:${top}px;height:${laneH}px"
            title="${escapeHtml(tip)}"
            aria-label="${escapeHtml(tip)}">${label}</div>`;
        }).join("");

        const todayX = ((now.getTime() - startMs) / totalMs) * 100;
        return `<div class="tl-row">
          <div class="tl-row-lbl">
            <span class="ld" style="background:${catColor(n.category)}"></span>
            <span class="nm" title="${escapeHtml(n.name)}">${escapeHtml(n.name)}</span>
          </div>
          <div class="tl-row-track" style="height:${trackH}px">
            <div class="tl-today" style="left:${todayX}%"></div>
            ${blocksHtml}
          </div>
        </div>`;
      }).join("");

    const totalShown = Object.values(fams).reduce((a, b) => a + b.length, 0);
    const eolCount = Object.values(fams).flat().filter(p => p.status === "eol").length;
    const eosCount = Object.values(fams).flat().filter(p => p.status === "eos").length;
    updateStatsTicker(totalShown, Object.keys(fams).length, eolCount, eosCount);

    const legendHtml = `<div id="tl-legend">
      <span class="tl-legend-swatch"><span style="background:rgba(45,206,92,.65)"></span>Current</span>
      <span class="tl-legend-swatch"><span style="background:rgba(245,158,11,.7)"></span>End of Sale</span>
      <span class="tl-legend-swatch"><span style="background:rgba(239,68,68,.78)"></span>End of Life</span>
      <span class="tl-legend-swatch"><span style="width:3px;background:#02C8FF"></span>Today</span>
      <span class="tl-legend-hint">Zoom: <code>+</code> / <code>−</code> / <code>0</code> reset · <code>FIT</code> fit-to-data · <code>⌘/Ctrl+scroll</code></span>
    </div>`;

    inner.innerHTML =
      `<div id="tl-layer-decades" aria-hidden="true"></div>` +
      axisHtml + rowHtml + legendHtml;

    renderDecadeBands(startY, endY, startMs, totalMs, dataW);
    renderMinimap(visibleProducts, startMs, totalMs);

    if (TL.hoverId) {
      const hovered = visibleProducts.find(p => p.id === TL.hoverId);
      if (hovered) setReadout(hovered);
      else setReadout(null);
    }
  }

  function setTimelineZoom(z) {
    TL.zoom = Math.max(TL.minZoom, Math.min(TL.maxZoom, z));
    renderTimeline();
  }

  function openTimelineView() {
    window.CPN_AcquisitionTimeline?.close?.();
    $("#tl-wrap")?.classList.add("show");
    document.body.classList.add("tl-open");
    $("#tools-timeline")?.classList.add("active");
    $("#tl-fam-drop")?.classList.remove("show");
    $("#tl-fam-btn")?.setAttribute("aria-expanded", "false");
    setTimelineZoom(TL.zoom);
    requestAnimationFrame(() => renderMinimapFromScroll());
  }

  function closeTimelineView() {
    $("#tl-fam-drop")?.classList.remove("show");
    $("#tl-fam-btn")?.setAttribute("aria-expanded", "false");
    $("#tl-cat-drop")?.classList.remove("show");
    $("#tl-cat-btn")?.setAttribute("aria-expanded", "false");
    window.closePanel?.();
    $("#tl-wrap")?.classList.remove("show");
    document.body.classList.remove("tl-open");
    $("#tools-timeline")?.classList.remove("active");
    setReadout(null);
  }

  function registerPhases() {
    const phases = window.__cpnV2?.phases;
    if (!phases) return;
    phases.renderTimeline = renderTimeline;
    phases.openTimelineView = openTimelineView;
    phases.closeTimelineView = closeTimelineView;
    phases.setTimelineZoom = setTimelineZoom;
  }

  function buildTimelineView() {
    if ($("#tl-wrap")) return;

    const tl = document.createElement("div");
    tl.id = "tl-wrap";
    tl.innerHTML = `
      <div id="tl-ambient" aria-hidden="true"></div>
      <div id="tl-head">
        <div class="tl-heading">
          <div class="tl-title">Refresh Timeline</div>
          <div class="tl-sub">Current, End-of-Sale, and End-of-Life products by family. Scroll to pan years · hover bars for readout · ⌘/Ctrl + scroll to zoom.</div>
          <div id="tl-stats-ticker" class="tl-stats-ticker" aria-live="polite"></div>
        </div>
        <div class="tl-head-controls">
          <div class="tl-zoom" role="group" aria-label="Zoom">
            <button type="button" id="tl-zoom-out" title="Zoom out (−)">−</button>
            <div class="tl-zoom-lvl" id="tl-zoom-lvl">100%</div>
            <button type="button" id="tl-zoom-in" title="Zoom in (+)">+</button>
            <button type="button" id="tl-zoom-fit" title="Fit data span to viewport" style="border-left:1px solid var(--border);font-size:10px;letter-spacing:.04em">FIT</button>
          </div>
          <div class="tl-cat-wrap">
            <button type="button" class="tbs tl-cat-btn" id="tl-cat-btn" title="Filter by main portfolio" aria-haspopup="true" aria-expanded="false" aria-label="Filter by portfolio: All portfolios">All portfolios ▾</button>
            <div id="tl-cat-drop" class="tl-cat-drop" role="menu" aria-label="Main portfolio filter">
              <button type="button" class="tl-cat-opt" role="menuitemradio" data-cat="" aria-checked="true">All portfolios</button>
              ${MAIN_CAT_ORDER.map(cat => `<button type="button" class="tl-cat-opt" role="menuitemradio" data-cat="${cat}" aria-checked="false">
                <span class="ld" style="background:${catColor(cat)}"></span>${MAIN_CAT_LABELS[cat]}</button>`).join("")}
            </div>
          </div>
          <div class="tl-fam-wrap">
            <button type="button" class="tbs tl-fam-btn" id="tl-fam-btn" title="Filter by product family" aria-haspopup="true" aria-expanded="false">All families ▾</button>
            <div id="tl-fam-drop" class="tl-fam-drop" role="dialog" aria-label="Family filter">
              <input type="search" id="tl-fam-search" class="tl-fam-search" placeholder="Search families…" autocomplete="off">
              <div id="tl-fam-list" class="tl-fam-list"></div>
              <button type="button" class="fac-clr" id="tl-fam-clr" hidden>Clear family filter</button>
            </div>
          </div>
          <button type="button" class="rc-btn" id="tl-only-stack">Show only stack items</button>
          <button type="button" class="rc-btn" id="tl-close">Close</button>
        </div>
      </div>
      <div id="tl-canvas-area">
        <div id="tl-canvas" tabindex="-1" role="region" aria-label="Refresh timeline">
          <div id="tl-viewport-flow" aria-hidden="true"></div>
          <div id="tl-inner"></div>
        </div>
        <div id="tl-readout" hidden>
          <span id="tl-readout-status"></span>
          <span id="tl-readout-name"></span>
          <span id="tl-readout-meta"></span>
        </div>
        <div id="tl-minimap">
          <div id="tl-minimap-track" role="slider" tabindex="0"
            aria-label="Timeline viewport" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div id="tl-minimap-dots"></div>
            <div id="tl-minimap-viewport"></div>
            <div id="tl-minimap-scan" aria-hidden="true"></div>
          </div>
          <div id="tl-minimap-labels"></div>
        </div>
      </div>`;
    document.body.appendChild(tl);

    const tlFamBtn = $("#tl-fam-btn");
    const tlFamDrop = $("#tl-fam-drop");
    const tlFamSearch = $("#tl-fam-search");
    const tlFamClr = $("#tl-fam-clr");
    const tlCatBtn = $("#tl-cat-btn");
    const tlCatDrop = $("#tl-cat-drop");

    function openTimelineCatDrop(open) {
      const show = open ?? !tlCatDrop.classList.contains("show");
      tlCatDrop.classList.toggle("show", show);
      tlCatBtn.setAttribute("aria-expanded", show ? "true" : "false");
      if (show) openTimelineFamilyDrop(false);
    }

    function setTimelineMainCat(cat) {
      TL.mainCat = cat || null;
      if (TL.mainCat && TL.families.size > 0) {
        const allowed = new Set(timelineFamiliesForFilter());
        TL.families.forEach(id => { if (!allowed.has(id)) TL.families.delete(id); });
      }
      updateTimelineMainCatBtn();
      updateTimelineFamilyBtn();
      tlCatDrop.querySelectorAll(".tl-cat-opt").forEach(btn => {
        const active = (btn.dataset.cat || null) === (TL.mainCat || null);
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-checked", active ? "true" : "false");
      });
      renderTimeline();
    }

    tlCatBtn.addEventListener("click", ev => { ev.stopPropagation(); openTimelineCatDrop(); });
    tlCatDrop.querySelectorAll(".tl-cat-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        setTimelineMainCat(btn.dataset.cat || null);
        openTimelineCatDrop(false);
      });
    });
    setTimelineMainCat(TL.mainCat);

    function openTimelineFamilyDrop(open) {
      const show = open ?? !tlFamDrop.classList.contains("show");
      tlFamDrop.classList.toggle("show", show);
      tlFamBtn.setAttribute("aria-expanded", show ? "true" : "false");
      if (show) {
        openTimelineCatDrop(false);
        populateTimelineFamilyList(tlFamSearch.value);
        tlFamSearch.focus();
      } else tlFamSearch.value = "";
    }

    tlFamBtn.addEventListener("click", ev => { ev.stopPropagation(); openTimelineFamilyDrop(); });
    tlFamSearch.addEventListener("input", () => populateTimelineFamilyList(tlFamSearch.value));
    tlFamSearch.addEventListener("keydown", ev => {
      if (ev.key === "Escape") openTimelineFamilyDrop(false);
    });
    tlFamClr.addEventListener("click", () => {
      TL.families.clear();
      updateTimelineFamilyBtn();
      populateTimelineFamilyList();
      renderTimeline();
    });
    document.addEventListener("click", ev => {
      if (tlCatDrop.classList.contains("show") &&
          !tlCatDrop.contains(ev.target) && ev.target !== tlCatBtn) {
        openTimelineCatDrop(false);
      }
      if (tlFamDrop.classList.contains("show") &&
          !tlFamDrop.contains(ev.target) && ev.target !== tlFamBtn) {
        openTimelineFamilyDrop(false);
      }
    });

    $("#tl-only-stack").addEventListener("click", () => {
      TL.onlyStack = !TL.onlyStack;
      $("#tl-only-stack").textContent = TL.onlyStack ? "Show all" : "Show only stack items";
      renderTimeline();
    });
    $("#tl-close").addEventListener("click", closeTimelineView);
    $("#tl-zoom-in").addEventListener("click", () => setTimelineZoom(TL.zoom * 1.4));
    $("#tl-zoom-out").addEventListener("click", () => setTimelineZoom(TL.zoom / 1.4));
    $("#tl-zoom-fit").addEventListener("click", () => setTimelineZoom(fitTimelineZoom()));

    const canvas = $("#tl-canvas");
    canvas.addEventListener("wheel", ev => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      const prevZ = TL.zoom;
      const factor = ev.deltaY > 0 ? 1 / 1.15 : 1.15;
      const newZ = Math.max(TL.minZoom, Math.min(TL.maxZoom, prevZ * factor));
      if (newZ === prevZ) return;
      const trackOffset = TL_LABEL_W + TL_GAP;
      const oldTrackW = TL.yearSpan * TL_BASE_PX_PER_YEAR * prevZ;
      const sx = ev.clientX - canvas.getBoundingClientRect().left;
      if (sx < TL_LABEL_W || oldTrackW <= 0) {
        setTimelineZoom(newZ);
        return;
      }
      const xWithinTrack = canvas.scrollLeft + sx - trackOffset;
      const ratio = xWithinTrack / oldTrackW;
      setTimelineZoom(newZ);
      const newTrackW = TL.yearSpan * TL_BASE_PX_PER_YEAR * newZ;
      canvas.scrollLeft = ratio * newTrackW + trackOffset - sx;
      renderMinimapFromScroll();
    }, { passive: false });

    canvas.addEventListener("scroll", () => renderMinimapFromScroll(), { passive: true });

    document.addEventListener("keydown", ev => {
      if (!$("#tl-wrap")?.classList.contains("show")) return;
      const tag = (ev.target.tagName || "").toLowerCase();
      if (ev.key === "Escape") {
        if ($("#tl-fam-drop")?.classList.contains("show")) {
          tlFamDrop.classList.remove("show");
          tlFamBtn.setAttribute("aria-expanded", "false");
          tlFamSearch.value = "";
        } else if ($("#tl-cat-drop")?.classList.contains("show")) {
          tlCatDrop.classList.remove("show");
          tlCatBtn.setAttribute("aria-expanded", "false");
        } else {
          closeTimelineView();
        }
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (ev.key === "+" || ev.key === "=") { setTimelineZoom(TL.zoom * 1.4); ev.preventDefault(); }
      else if (ev.key === "-" || ev.key === "_") { setTimelineZoom(TL.zoom / 1.4); ev.preventDefault(); }
      else if (ev.key === "0") { setTimelineZoom(1.0); ev.preventDefault(); }
    }, true);

    const inner = $("#tl-inner");
    inner.addEventListener("mouseover", ev => {
      const block = ev.target.closest?.(".tl-block");
      if (!block || !inner.contains(block)) return;
      const id = block.dataset.id;
      const product = getProducts().find(p => p.id === id);
      if (product) setReadout(product);
    });
    inner.addEventListener("mouseleave", ev => {
      if (!ev.relatedTarget || !inner.contains(ev.relatedTarget)) setReadout(null);
    });
    inner.addEventListener("focusin", ev => {
      const block = ev.target.closest?.(".tl-block");
      if (!block) return;
      const product = getProducts().find(p => p.id === block.dataset.id);
      if (product) setReadout(product);
    });
    inner.addEventListener("focusout", ev => {
      if (inner.contains(ev.relatedTarget)) return;
      setReadout(null);
    });
    inner.addEventListener("click", ev => {
      const block = ev.target.closest?.(".tl-block");
      if (!block) return;
      showProductDetail(block.dataset.id, { skipOutcomeCard: true });
    });
    canvas.addEventListener("click", ev => {
      if (!$("#tl-wrap")?.classList.contains("show")) return;
      if (ev.target.closest(".tl-block")) return;
      if ($("#panel")?.classList.contains("open")) {
        window.closePanel?.();
        setReadout(null);
      }
    });
    inner.addEventListener("keydown", ev => {
      const block = ev.target.closest?.(".tl-block");
      if (!block) return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        showProductDetail(block.dataset.id, { skipOutcomeCard: true });
      }
    });

    const minimapTrack = $("#tl-minimap-track");
    minimapTrack?.addEventListener("click", ev => scrubMinimap(ev.clientX));
    minimapTrack?.addEventListener("pointerdown", ev => {
      if (ev.button !== 0) return;
      scrubMinimap(ev.clientX);
      minimapTrack.setPointerCapture(ev.pointerId);
    });
    minimapTrack?.addEventListener("pointermove", ev => {
      if (minimapTrack.hasPointerCapture(ev.pointerId)) scrubMinimap(ev.clientX);
    });
    minimapTrack?.addEventListener("pointerup", hideMinimapScan);
    minimapTrack?.addEventListener("pointerleave", hideMinimapScan);
    minimapTrack?.addEventListener("keydown", ev => {
      const canvas = $("#tl-canvas");
      if (!canvas) return;
      const step = canvas.clientWidth * 0.15;
      if (ev.key === "ArrowLeft") { canvas.scrollLeft -= step; renderMinimapFromScroll(); ev.preventDefault(); }
      else if (ev.key === "ArrowRight") { canvas.scrollLeft += step; renderMinimapFromScroll(); ev.preventDefault(); }
    });

    const tBtn = document.createElement("button");
    tBtn.type = "button";
    tBtn.className = "tools-btn";
    tBtn.id = "tools-timeline";
    tBtn.innerHTML = `<span class="ti">⏱</span><span>Refresh Timeline</span>`;
    tBtn.title = "Open Refresh Timeline — current, EOS, and EOL dates across the portfolio (T)";
    tBtn.addEventListener("click", () => {
      if ($("#tl-wrap").classList.contains("show")) {
        closeTimelineView();
        tBtn.classList.remove("active");
      } else {
        openTimelineView();
        tBtn.classList.add("active");
      }
    });
    $("#tools")?.appendChild(tBtn);

    registerPhases();
    renderTimeline();
  }

  function init(ctx) {
    CTX = ctx || {};
    registerPhases();
  }

  window.CPN_RefreshTimeline = {
    init,
    build: buildTimelineView,
    open: openTimelineView,
    close: closeTimelineView,
    render: renderTimeline,
    setZoom: setTimelineZoom,
    testState: () => ({ ...TL }),
  };
})();
