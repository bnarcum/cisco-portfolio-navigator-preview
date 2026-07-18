/**
 * Cisco Acquisition History — parallax timeline (Shorthand-inspired).
 * Requires window.CPN_ACQUISITIONS from assets/cpn-acquisitions-data.js
 */
(function () {
  "use strict";

  const ACQ = {
    zoom: 1,
    minZoom: 0.35,
    maxZoom: 2.4,
    filter: "all",
    focusedId: null,
    yearMin: 1993,
    yearMax: 2026,
    pxPerYear: 72,
    cardW: 88,
    raf: 0,
    scrollVel: 0,
    level: "overview",
    anchorYear: null,
    expandedYear: null,
    searchQuery: "",
  };

  const $ = (s, r = document) => r.querySelector(s);

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function formatValue(v) {
    if (!v || v <= 0) return "";
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
    return `$${Math.round(v / 1e3)}K`;
  }

  function safeSourceUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function setLogoImg(img, acq) {
    img.onerror = null;
    img.src = acq.visualIdentity.path;
  }

  function yearX(year, month = 6) {
    const frac = year + (month - 1) / 12;
    return (frac - ACQ.yearMin) * ACQ.pxPerYear * ACQ.zoom + 120;
  }

  function dateX(iso) {
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return yearX(+iso.slice(0, 4));
    const y = d.getFullYear() + (d.getMonth() + d.getDate() / 31) / 12;
    return (y - ACQ.yearMin) * ACQ.pxPerYear * ACQ.zoom + 120;
  }

  function innerWidth() {
    return (ACQ.yearMax - ACQ.yearMin + 2) * ACQ.pxPerYear * ACQ.zoom + 240;
  }

  function filteredList() {
    const data = window.CPN_ACQUISITIONS;
    if (!data?.acquisitions) return [];
    let list = data.acquisitions;
    if (ACQ.filter === "featured") list = list.filter(a => a.featured);
    else if (ACQ.filter !== "all") list = list.filter(a => a.era === ACQ.filter);
    return list;
  }

  function searchAcquisitions(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (window.CPN_ACQUISITIONS?.acquisitions || []).filter(acq =>
      [acq.company, acq.business, acq.summary, acq.announced.slice(0, 4)]
        .some(value => String(value || "").toLowerCase().includes(q))
    );
  }

  function chronologicalList() {
    return filteredList().slice().sort((a, b) =>
      a.announced.localeCompare(b.announced) || a.id.localeCompare(b.id));
  }

  function focusRelative(delta) {
    const list = chronologicalList();
    if (!list.length) return;
    const current = list.findIndex(acq => acq.id === ACQ.focusedId);
    const index = current < 0 ? (delta > 0 ? -1 : 0) : current;
    const next = list[(index + delta + list.length) % list.length];
    if (next) focusAcquisition(next.id);
  }

  function getSemanticLevel(zoom = ACQ.zoom) {
    if (ACQ.focusedId) return "focus";
    return zoom < 0.78 ? "overview" : "explore";
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  function groupByYear(list) {
    return list.reduce((map, acq) => {
      const year = Number(acq.announced.slice(0, 4));
      const bucket = map.get(year) || [];
      bucket.push(acq);
      map.set(year, bucket);
      return map;
    }, new Map());
  }

  function layoutOverviewByYear(list, { mid, minGap = 58 }) {
    let lastX = -Infinity;
    return [...groupByYear(list)].map(([year, items]) => {
      const trueX = yearX(year, 6);
      const x = Math.max(trueX, lastX + minGap);
      lastX = x;
      return { year, items, x, y: mid, representedCount: items.length };
    });
  }

  function layoutExploreCards(list, { mid, cardW = 88, gap = 12, laneH = 128 }) {
    const lanes = [-1, 1, -2, 2, -3, 3];
    const laneRight = new Map(lanes.map(lane => [lane, -Infinity]));
    return list.map(acq => {
      const x = dateX(acq.announced);
      const lane = lanes.find(candidate => x >= laneRight.get(candidate) + cardW + gap);
      if (lane == null) return { acq, overflow: true, x, year: acq.announced.slice(0, 4) };
      laneRight.set(lane, x);
      return { acq, overflow: false, x, y: mid + lane * laneH / 2 };
    });
  }

  function buildParticles(container, n = 28) {
    container.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "acq-particle";
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `${Math.random() * 100}%`;
      p.dataset.phase = String(Math.random() * Math.PI * 2);
      container.appendChild(p);
    }
  }

  function renderEraBands(layer) {
    const bands = window.CPN_ACQUISITIONS?.eraBands || [];
    layer.innerHTML = "";
    bands.forEach(b => {
      const x1 = yearX(b.from, 1);
      const x2 = yearX(b.to + 1, 1);
      const el = document.createElement("div");
      el.className = "acq-era-band";
      el.style.left = `${x1}px`;
      el.style.width = `${Math.max(40, x2 - x1)}px`;
      el.style.background = b.color;
      const lbl = document.createElement("div");
      lbl.className = "acq-era-lbl";
      lbl.style.left = `${x1 + 12}px`;
      lbl.textContent = b.label;
      layer.appendChild(el);
      layer.appendChild(lbl);
    });
  }

  function renderYearTicks(inner) {
    inner.querySelectorAll(".acq-year-tick").forEach(e => e.remove());
    for (let y = ACQ.yearMin; y <= ACQ.yearMax; y += ACQ.zoom < 0.7 ? 5 : 1) {
      if (ACQ.zoom >= 0.7 && y % 5 !== 0 && y !== ACQ.yearMax) continue;
      const tick = document.createElement("div");
      tick.className = "acq-year-tick";
      tick.style.left = `${yearX(y)}px`;
      tick.textContent = y;
      inner.appendChild(tick);
    }
  }

  function renderOverview(inner, list, mid) {
    const canvas = $("#acq-canvas");
    const placements = layoutOverviewByYear(list, { mid });
    placements.forEach(placement => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "acq-year-marker";
      marker.dataset.year = String(placement.year);
      marker.setAttribute("role", "button");
      marker.tabIndex = 0;
      marker.style.setProperty("--tx", `${placement.x}px`);
      marker.style.setProperty("--ty", `${placement.y}px`);
      marker.setAttribute("aria-label", `Explore ${placement.year}: ${placement.representedCount} acquisitions`);

      const logo = placement.items.find(acq =>
        acq.featured && acq.visualIdentity?.kind === "verified-logo");
      if (logo) {
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        setLogoImg(img, logo);
        marker.appendChild(img);
      }

      const year = document.createElement("span");
      year.className = "acq-year-marker-year";
      year.textContent = String(placement.year);
      marker.appendChild(year);
      const count = document.createElement("span");
      count.className = "acq-year-marker-count";
      count.textContent = String(placement.representedCount);
      marker.appendChild(count);

      marker.addEventListener("click", () => {
        ACQ.anchorYear = placement.year;
        ACQ.expandedYear = null;
        ACQ.zoom = 1.05;
        updateZoomUi();
        renderAcquisitionTimeline();
        if (canvas) {
          canvas.scrollLeft = Math.max(0, yearX(placement.year, 6) - canvas.clientWidth / 2);
          renderCards(inner);
          updateParallax();
        }
      });
      inner.appendChild(marker);
    });
  }

  function createAcquisitionCard(placement, index) {
    const { acq: a, x, y } = placement;
    const card = document.createElement("div");
    card.className = "acq-card" + (a.featured ? " featured" : "") + (ACQ.focusedId && ACQ.focusedId !== a.id ? " dim" : "");
    if (ACQ.focusedId === a.id) card.classList.add("focused");
    card.style.setProperty("--tx", `${x}px`);
    card.style.setProperty("--ty", `${y}px`);
    card.style.setProperty("--acq-card-w", "88px");
    card.dataset.id = a.id;
    card.dataset.identity = a.visualIdentity?.kind || "";
    card.dataset.identitySource = a.visualIdentity?.source || "";
    card.dataset.depth = String(0.15 + (index % 5) * 0.08);
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.setAttribute("aria-label", [
      a.company,
      `announced ${a.announced}`,
      a.business,
      a.valueUsd ? formatValue(a.valueUsd) : "",
    ].filter(Boolean).join(", "));

    card.innerHTML = `
      <div class="acq-card-shell">
        <div class="acq-card-logo-wrap">
          <img class="acq-card-logo" alt="" loading="lazy" data-acq-id="${escapeHtml(a.id)}"/>
        </div>
        <div class="acq-card-name">${escapeHtml(a.company)}</div>
        <div class="acq-card-year">${escapeHtml(a.announced.slice(0, 7))}</div>
        ${a.valueUsd ? `<div class="acq-card-value">${formatValue(a.valueUsd)}</div>` : ""}
      </div>`;
    setLogoImg(card.querySelector(".acq-card-logo"), a);
    card.addEventListener("click", () => focusAcquisition(a.id));
    card.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      focusAcquisition(a.id);
    });
    return card;
  }

  function renderExplore(inner, list, mid) {
    const canvas = $("#acq-canvas");
    if (ACQ.expandedYear != null) {
      renderExpandedYear(inner, list, canvas);
      return;
    }
    const placements = layoutExploreCards(list, { mid });
    if (ACQ.anchorYear != null) {
      const year = String(ACQ.anchorYear);
      const promoted = placements.find(placement =>
        placement.overflow && placement.year === year && placement.acq.featured);
      const replaced = placements.slice().reverse().find(placement =>
        !placement.overflow &&
        placement.acq.announced.startsWith(year) &&
        !placement.acq.featured);
      if (promoted && replaced) {
        promoted.overflow = false;
        promoted.y = replaced.y;
        replaced.overflow = true;
        replaced.year = year;
      }
    }
    const viewportWidth = canvas?.clientWidth || 1440;
    const scrollLeft = canvas?.scrollLeft || 0;
    const minX = scrollLeft - viewportWidth;
    const maxX = scrollLeft + viewportWidth * 2;
    const overflows = new Map();

    placements.forEach((placement, index) => {
      if (placement.overflow) {
        const bucket = overflows.get(placement.year) || [];
        bucket.push(placement);
        overflows.set(placement.year, bucket);
        return;
      }
      if (placement.x + ACQ.cardW < minX || placement.x > maxX) return;
      inner.appendChild(createAcquisitionCard(placement, index));
    });

    overflows.forEach((items, year) => {
      const x = yearX(Number(year), 6);
      if (x < minX || x > maxX) return;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "acq-overflow-marker";
      marker.setAttribute("role", "button");
      marker.tabIndex = 0;
      marker.style.setProperty("--tx", `${x}px`);
      marker.textContent = `+${items.length}`;
      marker.setAttribute("aria-label", `Show ${items.length} more acquisitions from ${year}`);
      marker.addEventListener("click", () => {
        ACQ.anchorYear = Number(year);
        ACQ.expandedYear = Number(year);
        renderCards(inner);
        updateParallax();
      });
      inner.appendChild(marker);
    });
  }

  function renderExpandedYear(inner, list, canvas) {
    const year = String(ACQ.expandedYear);
    const items = list.filter(acq => acq.announced.startsWith(year));
    const tray = document.createElement("section");
    tray.className = "acq-year-expansion";
    tray.style.left = `${(canvas?.scrollLeft || 0) + 16}px`;
    tray.style.width = `${Math.max(280, (canvas?.clientWidth || 1440) - 32)}px`;
    tray.setAttribute("aria-label", `${year} acquisitions`);

    const head = document.createElement("div");
    head.className = "acq-year-expansion-head";
    const title = document.createElement("strong");
    title.textContent = `${year} · ${items.length} acquisitions`;
    head.appendChild(title);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "acq-year-expansion-close";
    close.textContent = "Return to timeline";
    close.addEventListener("click", () => {
      ACQ.expandedYear = null;
      renderCards(inner);
      updateParallax();
    });
    head.appendChild(close);
    tray.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "acq-year-expansion-grid";
    items.forEach((acq, index) => {
      grid.appendChild(createAcquisitionCard({
        acq,
        x: 0,
        y: 0,
        overflow: false,
      }, index));
    });
    tray.appendChild(grid);
    inner.appendChild(tray);
  }

  function renderCards(inner) {
    const active = document.activeElement;
    const focusTarget = active?.classList?.contains("acq-card")
      ? { type: "card", value: active.dataset.id }
      : active?.classList?.contains("acq-year-marker")
        ? { type: "year", value: active.dataset.year }
        : active?.classList?.contains("acq-overflow-marker")
          ? { type: "overflow", value: active.getAttribute("aria-label") }
          : null;
    inner.querySelectorAll(".acq-card, .acq-year-marker, .acq-overflow-marker, .acq-year-expansion, .acq-cluster").forEach(e => e.remove());
    const list = filteredList();
    const canvas = $("#acq-canvas");
    const mid = canvas ? canvas.clientHeight / 2 : 210;
    ACQ.level = getSemanticLevel();
    inner.dataset.represented = String(list.length);
    if (ACQ.level === "overview") renderOverview(inner, list, mid);
    else renderExplore(inner, list, mid);
    if (focusTarget) {
      let target = null;
      if (focusTarget.type === "card") {
        target = inner.querySelector(`.acq-card[data-id="${CSS.escape(focusTarget.value)}"]`);
      } else if (focusTarget.type === "year") {
        target = inner.querySelector(`.acq-year-marker[data-year="${CSS.escape(focusTarget.value)}"]`) ||
          [...inner.querySelectorAll(".acq-card")].find(card => {
            const acq = window.CPN_ACQUISITIONS.acquisitions.find(item => item.id === card.dataset.id);
            return acq?.announced.startsWith(focusTarget.value);
          }) ||
          inner.querySelector(`.acq-overflow-marker[aria-label*="${CSS.escape(focusTarget.value)}"]`);
      } else {
        target = [...inner.querySelectorAll(".acq-overflow-marker")]
          .find(marker => marker.getAttribute("aria-label") === focusTarget.value);
      }
      target?.focus({ preventScroll: true });
    }
  }

  function renderMinimap() {
    const track = $("#acq-minimap-track");
    const dots = $("#acq-minimap-dots");
    const vp = $("#acq-minimap-viewport");
    if (!track || !dots) return;

    dots.innerHTML = "";
    const list = window.CPN_ACQUISITIONS?.acquisitions || [];
    const w = track.clientWidth || 400;
    const span = ACQ.yearMax - ACQ.yearMin || 1;
    list.forEach(a => {
      const y = +a.announced.slice(0, 4);
      const dot = document.createElement("div");
      dot.className = "acq-mini-dot" + (a.featured ? " featured" : "");
      dot.style.left = `${((y - ACQ.yearMin) / span) * 100}%`;
      dots.appendChild(dot);
    });

    const canvas = $("#acq-canvas");
    if (!canvas || !vp) return;
    const innerW = innerWidth();
    const ratio = w / innerW;
    vp.style.width = `${Math.max(24, canvas.clientWidth * ratio)}px`;
    vp.style.left = `${canvas.scrollLeft * ratio}px`;
  }

  function focusAcquisition(id) {
    ACQ.focusedId = id;
    const a = window.CPN_ACQUISITIONS?.acquisitions?.find(x => x.id === id);
    const panel = $("#acq-focus");
    if (!a || !panel) return;
    panel.classList.add("show");
    setLogoImg($("#acq-focus-logo"), a);
    $("#acq-focus-title").textContent = a.company;
    $("#acq-focus-meta").textContent = [
      a.announced,
      a.valueUsd ? formatValue(a.valueUsd) : null,
      a.business || null,
      a.country || null,
    ].filter(Boolean).join(" · ");
    $("#acq-focus-summary").textContent = a.summary || a.business || "Cisco acquisition.";
    const source = $("#acq-focus-source");
    if (source) {
      const sourceUrl = safeSourceUrl(a.visualIdentity?.sourceUrl);
      source.hidden = !sourceUrl;
      if (sourceUrl) {
        source.href = sourceUrl;
        source.textContent = `Visual identity source: ${a.visualIdentity.source}`;
      } else {
        source.removeAttribute("href");
        source.textContent = "";
      }
    }
    const jumpBtn = $("#acq-focus-jump");
    if (jumpBtn) {
      jumpBtn.hidden = !(a.families && a.families.length);
      jumpBtn.onclick = () => {
        if (a.families?.[0] && typeof window.jumpTo === "function") {
          closeAcquisitionTimeline();
          window.jumpTo(a.families[0]);
        }
      };
    }
    renderCards($("#acq-inner"));
    const canvas = $("#acq-canvas");
    if (canvas) {
      const x = dateX(a.announced) - canvas.clientWidth / 2;
      canvas.scrollTo({
        left: Math.max(0, x),
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  }

  function updateParallax() {
    const canvas = $("#acq-canvas");
    const inner = $("#acq-inner");
    if (!canvas || !inner) return;
    const x = canvas.scrollLeft;
    if (prefersReducedMotion()) {
      inner.querySelectorAll(".acq-layer[data-depth], .acq-particle").forEach(node => {
        node.style.transform = "";
      });
      renderMinimap();
      updateCurrentPeriod();
      return;
    }
    inner.querySelectorAll(".acq-layer[data-depth]").forEach(layer => {
      const d = +layer.dataset.depth || 0.3;
      layer.style.transform = `translate3d(${-x * d * 0.12}px, 0, 0)`;
    });

    $("#acq-particles")?.querySelectorAll(".acq-particle").forEach(p => {
      const t = performance.now();
      const ph = +p.dataset.phase || 0;
      const dx = Math.sin(t / 3000 + ph) * 12 + ACQ.scrollVel * 0.3;
      const dy = Math.cos(t / 4000 + ph) * 8;
      p.style.transform = `translate(${dx}px, ${dy}px)`;
    });

    renderMinimap();
    updateCurrentPeriod();
  }

  function updateCurrentPeriod() {
    const canvas = $("#acq-canvas");
    const label = $("#acq-current-period");
    if (!canvas || !label) return;
    const center = canvas.scrollLeft + canvas.clientWidth / 2;
    const rawYear = ACQ.yearMin + (center - 120) / (ACQ.pxPerYear * ACQ.zoom);
    const year = Math.max(ACQ.yearMin, Math.min(ACQ.yearMax, Math.round(rawYear)));
    if (getSemanticLevel() === "overview") {
      const era = (window.CPN_ACQUISITIONS?.eraBands || [])
        .find(band => year >= band.from && year <= band.to);
      label.textContent = era?.label || String(year);
    } else {
      label.textContent = String(year);
    }
  }

  function onScroll() {
    ACQ.scrollVel = 0;
    cancelAnimationFrame(ACQ.raf);
    ACQ.raf = requestAnimationFrame(() => {
      const inner = $("#acq-inner");
      if (inner && getSemanticLevel() !== "overview") renderCards(inner);
      updateParallax();
    });
  }

  function updateZoomUi() {
    const lvl = $("#acq-zoom-lvl");
    if (lvl) lvl.textContent = `${Math.round(ACQ.zoom * 100)}%`;
    const out = $("#acq-zoom-out");
    const inn = $("#acq-zoom-in");
    if (out) out.disabled = ACQ.zoom <= ACQ.minZoom + 0.01;
    if (inn) inn.disabled = ACQ.zoom >= ACQ.maxZoom - 0.01;
  }

  function setAcqZoom(z) {
    const canvas = $("#acq-canvas");
    const prev = ACQ.zoom;
    ACQ.zoom = Math.max(ACQ.minZoom, Math.min(ACQ.maxZoom, z));
    updateZoomUi();
    renderAcquisitionTimeline();
    if (canvas) {
      const ratio = ACQ.zoom / prev;
      canvas.scrollLeft *= ratio;
    }
    updateParallax();
  }

  function fitAcqZoom() {
    const canvas = $("#acq-canvas");
    if (!canvas) return;
    ACQ.zoom = ACQ.minZoom;
    ACQ.level = "overview";
    updateZoomUi();
    renderAcquisitionTimeline();
    updateParallax();
  }

  function renderAcquisitionTimeline() {
    const data = window.CPN_ACQUISITIONS;
    if (!data) return;
    const inner = $("#acq-inner");
    if (!inner) return;

    ACQ.yearMin = 1993;
    ACQ.yearMax = Math.max(2026, ...data.acquisitions.map(a => +a.announced.slice(0, 4))) + 1;

    inner.style.width = `${innerWidth()}px`;
    renderEraBands($("#acq-layer-eras"));
    renderYearTicks(inner);
    renderCards(inner);
    updateParallax();
  }

  function revealSearchResult(acq) {
    const canvas = $("#acq-canvas");
    if (!canvas || !acq) return;
    ACQ.zoom = Math.max(1.05, ACQ.zoom);
    ACQ.anchorYear = Number(acq.announced.slice(0, 4));
    ACQ.expandedYear = null;
    updateZoomUi();
    renderAcquisitionTimeline();
    canvas.scrollLeft = Math.max(0, dateX(acq.announced) - canvas.clientWidth / 2);
    renderCards($("#acq-inner"));
    updateParallax();
  }

  function renderSearchResults() {
    const popup = $("#acq-search-results");
    const input = $("#acq-search");
    if (!popup || !input) return [];
    const results = searchAcquisitions(input.value);
    ACQ.searchQuery = input.value;
    popup.innerHTML = "";
    results.slice(0, 8).forEach((acq, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "acq-search-result";
      option.id = `acq-search-result-${index}`;
      option.setAttribute("role", "option");
      option.dataset.id = acq.id;
      option.textContent = `${acq.company} · ${acq.announced.slice(0, 4)}`;
      option.addEventListener("click", () => {
        focusAcquisition(acq.id);
        popup.hidden = true;
        input.setAttribute("aria-expanded", "false");
      });
      popup.appendChild(option);
    });
    popup.hidden = !results.length;
    input.setAttribute("aria-expanded", String(results.length > 0));
    if (results[0]) revealSearchResult(results[0]);
    return results;
  }

  function clearSearchResults() {
    const input = $("#acq-search");
    const popup = $("#acq-search-results");
    if (input) {
      input.value = "";
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    if (popup) {
      popup.innerHTML = "";
      popup.hidden = true;
    }
    ACQ.searchQuery = "";
  }

  function setFilter(filter, label) {
    ACQ.filter = filter;
    ACQ.focusedId = null;
    ACQ.expandedYear = null;
    $("#acq-focus")?.classList.remove("show");
    const button = $("#acq-filter-btn");
    const menu = $("#acq-filter-menu");
    if (button) {
      button.textContent = `Filters: ${label}`;
      button.setAttribute("aria-expanded", "false");
    }
    if (menu) menu.hidden = true;
    menu?.querySelectorAll("[data-acq-filter]").forEach(item => {
      item.setAttribute("aria-checked", String(item.dataset.acqFilter === filter));
    });
    renderAcquisitionTimeline();
  }

  function buildFilterMenu() {
    const menu = $("#acq-filter-menu");
    if (!menu) return;
    const filters = [
      { id: "all", label: "All" },
      { id: "featured", label: "Megadeals" },
      ...(window.CPN_ACQUISITIONS?.eraBands || []).map(band => ({
        id: band.id,
        label: band.label,
      })),
    ];
    filters.forEach(filter => {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(filter.id === ACQ.filter));
      item.dataset.acqFilter = filter.id;
      item.textContent = filter.label;
      item.addEventListener("click", () => setFilter(filter.id, filter.label));
      menu.appendChild(item);
    });
  }

  function testState() {
    const canvasRect = document.querySelector("#acq-canvas")?.getBoundingClientRect();
    const intersectsCanvas = rect => canvasRect &&
      rect.left < canvasRect.right && rect.right > canvasRect.left &&
      rect.top < canvasRect.bottom && rect.bottom > canvasRect.top;
    const nodes = [...document.querySelectorAll(".acq-year-marker, .acq-card, .acq-overflow-marker")];
    const rects = nodes.map(node => node.getBoundingClientRect()).filter(intersectsCanvas);
    const mountedIds = [...document.querySelectorAll(".acq-card")].map(el => el.dataset.id);
    const visibleIds = [...document.querySelectorAll(".acq-card")]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return intersectsCanvas(rect);
      })
      .map(el => el.dataset.id);
    let overlapCount = 0;
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          overlapCount += 1;
        }
      }
    }
    return {
      level: getSemanticLevel(),
      totalCount: window.CPN_ACQUISITIONS.acquisitions.length,
      representedCount: Number(document.querySelector("#acq-inner")?.dataset.represented || 0),
      renderedCards: document.querySelectorAll(".acq-card").length,
      mountedIds,
      visibleIds,
      overflowMarkers: document.querySelectorAll(".acq-overflow-marker").length,
      overlapCount,
      zoom: ACQ.zoom,
      anchorYear: ACQ.anchorYear,
      expandedYear: ACQ.expandedYear,
      focusedId: ACQ.focusedId,
      reducedMotion: prefersReducedMotion(),
    };
  }

  function buildAcquisitionTimelineView() {
    if ($("#acq-wrap")) return;
    if (!window.CPN_ACQUISITIONS) {
      console.warn("CPN_ACQUISITIONS not loaded");
      return;
    }

    const wrap = document.createElement("div");
    wrap.id = "acq-wrap";
    wrap.innerHTML = `
      <div id="acq-ambient" aria-hidden="true">
        <div id="acq-particles" class="acq-layer" data-depth="0.05"></div>
        <div id="acq-layer-eras" class="acq-layer" data-depth="0.08"></div>
      </div>
      <div id="acq-head">
        <div class="acq-heading">
          <div class="acq-title">Acquisition History</div>
          <div class="acq-sub">${window.CPN_ACQUISITIONS.acquisitions.length} companies · scroll to explore · click a logo for details · sources: Wikipedia & Cisco</div>
          <div id="acq-current-period" aria-live="polite"></div>
        </div>
        <div class="acq-head-controls">
          <div class="acq-search-wrap">
            <label class="acq-sr-only" for="acq-search">Search acquisitions</label>
            <input id="acq-search" type="search" placeholder="Search acquisitions"
              role="combobox" aria-autocomplete="list" aria-controls="acq-search-results"
              aria-expanded="false" autocomplete="off"/>
            <div id="acq-search-results" role="listbox" hidden></div>
          </div>
          <button type="button" class="rc-btn acq-nav-btn" id="acq-prev" aria-label="Previous acquisition">←</button>
          <button type="button" class="rc-btn acq-nav-btn" id="acq-next" aria-label="Next acquisition">→</button>
          <div class="acq-zoom" role="group" aria-label="Zoom">
            <button type="button" id="acq-zoom-out" title="Zoom out">−</button>
            <div class="acq-zoom-lvl" id="acq-zoom-lvl">100%</div>
            <button type="button" id="acq-zoom-in" title="Zoom in">+</button>
            <button type="button" id="acq-zoom-fit" title="Fit timeline" style="border-left:1px solid var(--border);font-size:10px">FIT</button>
          </div>
          <div class="acq-filter-wrap">
            <button type="button" class="rc-btn" id="acq-filter-btn"
              aria-haspopup="true" aria-expanded="false">Filters: All</button>
            <div id="acq-filter-menu" role="menu" hidden></div>
          </div>
          <button type="button" class="rc-btn" id="acq-close">Close</button>
        </div>
      </div>
      <div id="acq-focus" aria-live="polite">
        <div id="acq-focus-inner">
          <img id="acq-focus-logo" alt="" width="72" height="72"/>
          <div>
            <h3 id="acq-focus-title"></h3>
            <div id="acq-focus-meta"></div>
            <div id="acq-focus-summary"></div>
            <a id="acq-focus-source" target="_blank" rel="noopener noreferrer" hidden></a>
          </div>
          <div id="acq-focus-actions">
            <button type="button" class="rc-btn" id="acq-focus-jump" hidden>View in portfolio →</button>
            <button type="button" class="rc-btn" id="acq-focus-clear">Clear selection</button>
          </div>
        </div>
      </div>
      <div id="acq-canvas"><div id="acq-inner">
        <div id="acq-spine-wrap" class="acq-layer" data-depth="0.04"><div id="acq-spine"></div></div>
      </div></div>
      <div id="acq-minimap">
        <div id="acq-minimap-track"><div id="acq-minimap-dots"></div><div id="acq-minimap-viewport"></div></div>
        <div id="acq-minimap-labels"><span>${ACQ.yearMin}</span><span>${ACQ.yearMax}</span></div>
      </div>`;
    document.body.appendChild(wrap);

    buildParticles($("#acq-particles"));
    buildFilterMenu();

    $("#acq-close")?.addEventListener("click", closeAcquisitionTimeline);
    $("#acq-focus-clear")?.addEventListener("click", () => {
      ACQ.focusedId = null;
      $("#acq-focus")?.classList.remove("show");
      renderAcquisitionTimeline();
    });
    $("#acq-zoom-in")?.addEventListener("click", () => setAcqZoom(ACQ.zoom * 1.25));
    $("#acq-zoom-out")?.addEventListener("click", () => setAcqZoom(ACQ.zoom / 1.25));
    $("#acq-zoom-fit")?.addEventListener("click", fitAcqZoom);
    $("#acq-prev")?.addEventListener("click", () => focusRelative(-1));
    $("#acq-next")?.addEventListener("click", () => focusRelative(1));
    $("#acq-search")?.addEventListener("input", renderSearchResults);
    $("#acq-search")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        const first = searchAcquisitions(event.currentTarget.value)[0];
        if (!first) return;
        event.preventDefault();
        focusAcquisition(first.id);
        clearSearchResults();
        $("#acq-inner")?.querySelector(`.acq-card[data-id="${CSS.escape(first.id)}"]`)
          ?.focus({ preventScroll: true });
      } else if (event.key === "Escape" && ACQ.searchQuery) {
        event.preventDefault();
        event.stopPropagation();
        clearSearchResults();
      }
    });
    $("#acq-filter-btn")?.addEventListener("click", event => {
      const button = event.currentTarget;
      const menu = $("#acq-filter-menu");
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      if (menu) menu.hidden = !open;
      if (open) menu?.querySelector('[aria-checked="true"]')?.focus();
    });
    document.addEventListener("click", event => {
      if (event.target.closest(".acq-filter-wrap")) return;
      const menu = $("#acq-filter-menu");
      if (menu) menu.hidden = true;
      $("#acq-filter-btn")?.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("keydown", event => {
      if (!$("#acq-wrap")?.classList.contains("show")) return;
      if (event.key === "Escape") {
        if (ACQ.searchQuery) {
          clearSearchResults();
        } else if (!$("#acq-filter-menu")?.hidden) {
          $("#acq-filter-menu").hidden = true;
          $("#acq-filter-btn")?.setAttribute("aria-expanded", "false");
          $("#acq-filter-btn")?.focus();
        } else {
          closeAcquisitionTimeline();
        }
        event.preventDefault();
        return;
      }
      if (event.target.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        focusRelative(event.key === "ArrowLeft" ? -1 : 1);
      }
    });

    const canvas = $("#acq-canvas");
    canvas?.addEventListener("scroll", onScroll, { passive: true });
    canvas?.addEventListener("wheel", ev => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      setAcqZoom(ACQ.zoom * (ev.deltaY > 0 ? 0.92 : 1.08));
    }, { passive: false });

    $("#acq-minimap-track")?.addEventListener("click", ev => {
      const track = ev.currentTarget;
      const rect = track.getBoundingClientRect();
      const pct = (ev.clientX - rect.left) / rect.width;
      const innerW = innerWidth();
      canvas.scrollLeft = pct * innerW - canvas.clientWidth / 2;
    });

    const tBtn = document.createElement("button");
    tBtn.type = "button";
    tBtn.className = "tools-btn";
    tBtn.id = "tools-acquisitions";
    tBtn.innerHTML = `<span class="ti">◆</span><span>Acquisitions</span>`;
    tBtn.title = "Acquisition History — interactive logo timeline (A)";
    tBtn.addEventListener("click", () => {
      if ($("#acq-wrap")?.classList.contains("show")) closeAcquisitionTimeline();
      else openAcquisitionTimeline();
    });
    $("#tools")?.appendChild(tBtn);

    updateZoomUi();
    renderAcquisitionTimeline();

    function animLoop() {
      if ($("#acq-wrap")?.classList.contains("show")) updateParallax();
      requestAnimationFrame(animLoop);
    }
    requestAnimationFrame(animLoop);
  }

  function openAcquisitionTimeline() {
    $("#acq-wrap")?.classList.add("show");
    document.body.classList.add("acq-open");
    $("#tools-acquisitions")?.classList.add("active");
    window.__cpnV2?.phases?.closeTimelineView?.();
    renderAcquisitionTimeline();
    fitAcqZoom();
    $("#acq-search")?.focus({ preventScroll: true });
  }

  function closeAcquisitionTimeline() {
    $("#acq-wrap")?.classList.remove("show");
    document.body.classList.remove("acq-open");
    $("#tools-acquisitions")?.classList.remove("active");
    ACQ.focusedId = null;
    clearSearchResults();
    $("#acq-focus")?.classList.remove("show");
  }

  function closeTimelineView() {
    document.querySelector("#tl-wrap")?.classList.remove("show");
    document.body.classList.remove("tl-open");
    document.querySelector("#tools-timeline")?.classList.remove("active");
  }

  window.CPN_AcquisitionTimeline = {
    build: buildAcquisitionTimelineView,
    open: openAcquisitionTimeline,
    close: closeAcquisitionTimeline,
    render: renderAcquisitionTimeline,
    setZoom: setAcqZoom,
    getSemanticLevel,
    layoutOverviewByYear,
    layoutExploreCards,
    searchAcquisitions,
    focusRelative,
    testState,
  };
})();
