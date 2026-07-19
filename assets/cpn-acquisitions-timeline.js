/**
 * Cisco Acquisition History — "network signal map" timeline.
 * Requires window.CPN_ACQUISITIONS from assets/cpn-acquisitions-data.js
 */
(function () {
  "use strict";

  const ACQ = {
    zoom: 1,
    minZoom: 0.35,
    maxZoom: 5,
    filter: "all",
    focusedId: null,
    yearMin: 1993,
    yearMax: 2026,
    pxPerYear: 72,
    cardW: 88,
    raf: 0,
    level: "overview",
    anchorYear: null,
    expandedYear: null,
    searchQuery: "",
    searchActiveIndex: -1,
    searchHighlightIds: null,
    focusReturnId: null,
    opener: null,
    tourTimer: null,
    tourIndex: -1,
  };

  const LANDMARK_IDS = [
    "stratacom", "cerent", "webex", "scientific-atlanta", "tandberg", "meraki",
    "sourcefire", "opendns", "duo-security", "appdynamics", "thousandeyes", "splunk",
  ];

  const $ = (s, r = document) => r.querySelector(s);

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function eraColorFor(eraId) {
    const band = (window.CPN_ACQUISITIONS?.eraBands || []).find(b => b.id === eraId);
    return band?.color || "#02C8FF";
  }

  function eraLabelFor(eraId) {
    const band = (window.CPN_ACQUISITIONS?.eraBands || []).find(b => b.id === eraId);
    return band?.label || eraId;
  }

  function summaryHeadline(acq) {
    const text = (acq.summary || acq.business || "").trim();
    if (!text) return acq.business || "Cisco acquisition.";
    const sentence = text.split(/(?<=[.!?])\s+/)[0];
    return sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence;
  }

  function cumulativeSpendThroughYear(year) {
    return (window.CPN_ACQUISITIONS?.acquisitions || [])
      .filter(a => +a.announced.slice(0, 4) <= year)
      .reduce((sum, a) => sum + (a.valueUsd || 0), 0);
  }

  function getCenterYear() {
    const canvas = $("#acq-canvas");
    if (!canvas) return ACQ.yearMin;
    const center = canvas.scrollLeft + canvas.clientWidth / 2;
    const rawYear = ACQ.yearMin + (center - 120) / (ACQ.pxPerYear * ACQ.zoom);
    return Math.max(ACQ.yearMin, Math.min(ACQ.yearMax, Math.round(rawYear)));
  }

  function yearDealWeight(items) {
    const max = Math.max(0, ...items.map(a => a.valueUsd || 0));
    if (max >= 5e9) return 3;
    if (max >= 1e9) return 2;
    if (max >= 1e8) return 1;
    return 0;
  }

  function miniDotScale(valueUsd) {
    if (!valueUsd || valueUsd <= 0) return 1;
    if (valueUsd >= 5e9) return 2.4;
    if (valueUsd >= 1e9) return 1.8;
    if (valueUsd >= 1e8) return 1.35;
    return 1;
  }

  function formatValue(v) {
    if (!v || v <= 0) return "";
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
    return `$${Math.round(v / 1e3)}K`;
  }

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatAnnouncedDate(iso) {
    if (!iso) return "";
    const match = String(iso).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!match) return iso;
    const year = match[1];
    const month = match[2];
    if (!month) return year;
    const index = Number(month) - 1;
    if (index < 0 || index > 11) return year;
    return `${year} - ${MONTHS_SHORT[index]}`;
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

  function isVisible(node) {
    return Boolean(node?.isConnected && !node.hidden && node.getClientRects().length &&
      !node.closest("[hidden], [aria-hidden='true']"));
  }

  function focusVisible(node) {
    if (!isVisible(node)) return false;
    node.focus({ preventScroll: true });
    return document.activeElement === node;
  }

  function restoreCardFocus(id, attempts = 90) {
    const tryFocus = remaining => {
      if (!$("#acq-wrap")?.classList.contains("show") || ACQ.focusedId !== id) return;
      const card = $(`#acq-inner .acq-card[data-id="${CSS.escape(id)}"]`);
      if (focusVisible(card) || remaining <= 0) return;
      requestAnimationFrame(() => tryFocus(remaining - 1));
    };
    requestAnimationFrame(() => tryFocus(attempts));
  }

  function getSemanticLevel(zoom = ACQ.zoom) {
    if (ACQ.focusedId) return "focus";
    return zoom < 0.78 ? "overview" : "explore";
  }

  function exploreCardWidth(zoom = ACQ.zoom) {
    const exploreStart = 0.78;
    if (zoom <= exploreStart) return ACQ.cardW;
    return Math.min(240, Math.round(ACQ.cardW * (1 + (zoom - exploreStart) * 0.45)));
  }

  function nameDisplayTier(zoom = ACQ.zoom) {
    if (zoom >= 4) return "full";
    if (zoom >= 2.8) return "3";
    if (zoom >= 1.6) return "2";
    return "1";
  }

  function updateCanvasNameTier() {
    const canvas = $("#acq-canvas");
    if (canvas) canvas.dataset.nameTier = nameDisplayTier();
  }

  // Worst-case rendered .acq-card height for the current name tier (card
  // padding + line-clamped name block + meta row), used to keep lane
  // spacing collision-safe without measuring the live DOM every frame.
  function estimateExploreCardHeight() {
    const tier = nameDisplayTier();
    const nameH = tier === "full" ? 43 : tier === "3" ? 39 : tier === "2" ? 26 : 13;
    return 13 + nameH + 4 + 11;
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

  function layoutExploreCards(list, { mid, cardW = 88, gap = 12, laneH = 128, lanes = [-1, 1, -2, 2, -3, 3] }) {
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
      el.style.setProperty("--acq-era-color", b.color);
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

  function renderYearMarkers(inner, list, mid, { explore = false, mergedYears = null } = {}) {
    const canvas = $("#acq-canvas");
    const placements = layoutOverviewByYear(list, { mid });

    placements.forEach(placement => {
      const merged = Boolean(mergedYears?.has(String(placement.year)));
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "acq-year-marker" +
        (explore ? " compact" : "") +
        (explore && ACQ.anchorYear === placement.year ? " active" : "") +
        (merged ? " has-overflow" : "") +
        (yearDealWeight(placement.items) >= 2 ? " acq-year-marker--heavy" : "");
      marker.dataset.year = String(placement.year);
      marker.setAttribute("role", "button");
      marker.tabIndex = 0;
      marker.style.setProperty("--tx", `${placement.x}px`);
      marker.style.setProperty("--ty", `${placement.y}px`);
      marker.setAttribute("aria-label", merged
        ? `Explore ${placement.year}: ${placement.representedCount} acquisitions, tap to expand list`
        : `Explore ${placement.year}: ${placement.representedCount} acquisitions`);

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
        // When the canvas is too short to float a separate overflow hub
        // without colliding (see `cramped` in renderExplore), the marker
        // itself becomes the drill-in affordance for that year's overflow.
        ACQ.expandedYear = merged ? placement.year : null;
        if (ACQ.zoom < 0.78) {
          ACQ.zoom = 1.05;
          updateZoomUi();
          renderAcquisitionTimeline();
        }
        if (canvas) {
          canvas.scrollLeft = Math.max(0, yearX(placement.year, 6) - canvas.clientWidth / 2);
        }
        renderCards(inner);
        updateParallax();
      });
      inner.appendChild(marker);
    });
  }

  function renderLandmarks(inner, list) {
    if (getSemanticLevel() !== "overview" || ACQ.zoom < 0.45) return;
    const byId = new Map(list.map(a => [a.id, a]));
    LANDMARK_IDS.forEach(id => {
      const acq = byId.get(id);
      if (!acq) return;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "acq-landmark" + (acq.featured ? " featured" : "");
      el.dataset.id = acq.id;
      el.style.setProperty("--tx", `${dateX(acq.announced)}px`);
      el.style.setProperty("--acq-era-color", eraColorFor(acq.era));
      el.textContent = acq.company.length > 22 ? `${acq.company.slice(0, 20)}…` : acq.company;
      el.setAttribute("aria-label", `${acq.company}, ${formatAnnouncedDate(acq.announced)}`);
      el.addEventListener("click", () => {
        ACQ.anchorYear = Number(acq.announced.slice(0, 4));
        if (ACQ.zoom < 0.78) ACQ.zoom = 1.05;
        updateZoomUi();
        renderAcquisitionTimeline();
        focusAcquisition(acq.id);
      });
      inner.appendChild(el);
    });
  }

  function renderOverview(inner, list, mid) {
    renderYearMarkers(inner, list, mid, { explore: false });
    if (ACQ.zoom >= 0.45) renderLandmarks(inner, list);
  }

  function createAcquisitionCard(placement, index) {
    const { acq: a, x, y } = placement;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "acq-card" +
      (a.featured ? " featured" : "") +
      (ACQ.focusedId && ACQ.focusedId !== a.id ? " dim" : "") +
      (ACQ.focusedId === a.id ? " focused" : "");
    card.dataset.id = a.id;
    card.style.setProperty("--tx", `${x}px`);
    card.style.setProperty("--ty", `${y}px`);
    card.style.setProperty("--acq-card-w", `${exploreCardWidth()}px`);
    card.style.setProperty("--acq-era-color", eraColorFor(a.era));
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.setAttribute("aria-label", [
      a.company,
      `announced ${formatAnnouncedDate(a.announced)}`,
      a.business,
      a.valueUsd ? formatValue(a.valueUsd) : "",
    ].filter(Boolean).join(", "));

    const spotlight = ACQ.searchHighlightIds;
    if (spotlight) card.classList.add(spotlight.has(a.id) ? "locked" : "spotlight-dim");

    card.innerHTML = `
      <span class="acq-card-name">${escapeHtml(a.company)}</span>
      <span class="acq-card-meta">
        <span class="acq-card-date">${escapeHtml(formatAnnouncedDate(a.announced))}</span>
        ${a.valueUsd ? `<span class="acq-card-value">${formatValue(a.valueUsd)}</span>` : ""}
      </span>`;
    card.addEventListener("click", () => focusAcquisition(a.id));
    card.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      focusAcquisition(a.id);
    });
    return card;
  }

  function renderOverflowCluster(inner, year, items, y) {
    const x = yearX(Number(year), 6);
    const hub = document.createElement("button");
    hub.type = "button";
    hub.className = "acq-overflow-marker";
    hub.setAttribute("role", "button");
    hub.tabIndex = 0;
    hub.style.setProperty("--tx", `${x}px`);
    hub.style.setProperty("--ty", `${y}px`);
    hub.setAttribute("aria-label", `Show ${items.length} more acquisitions from ${year}`);

    const satelliteCount = Math.min(6, items.length);
    for (let i = 0; i < satelliteCount; i++) {
      const angle = (Math.PI * 2 * i) / satelliteCount - Math.PI / 2;
      const dot = document.createElement("span");
      dot.className = "acq-overflow-dot";
      dot.setAttribute("aria-hidden", "true");
      dot.style.setProperty("--dx", `${Math.cos(angle) * 14}px`);
      dot.style.setProperty("--dy", `${Math.sin(angle) * 14}px`);
      hub.appendChild(dot);
    }
    const label = document.createElement("span");
    label.className = "acq-overflow-label";
    label.textContent = `+${items.length}`;
    hub.appendChild(label);

    function expand() {
      ACQ.anchorYear = Number(year);
      ACQ.expandedYear = Number(year);
      renderCards(inner);
      updateParallax();
    }
    hub.addEventListener("click", expand);
    hub.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      expand();
    });
    inner.appendChild(hub);
  }

  function renderExpandedYear(inner, list, canvas) {
    const year = String(ACQ.expandedYear);
    const items = list
      .filter(acq => acq.announced.startsWith(year))
      .slice()
      .sort((a, b) =>
        (b.valueUsd || 0) - (a.valueUsd || 0) ||
        a.company.localeCompare(b.company));

    const tray = document.createElement("section");
    tray.className = "acq-year-expansion";
    tray.style.left = `${(canvas?.scrollLeft || 0) + 16}px`;
    tray.style.width = `${Math.max(280, (canvas?.clientWidth || 1440) - 32)}px`;
    tray.setAttribute("aria-label", `${year} acquisitions`);

    const head = document.createElement("div");
    head.className = "acq-year-expansion-head";
    const title = document.createElement("strong");
    title.textContent = `${year} · ${items.length} acquisition${items.length !== 1 ? "s" : ""}`;
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
      grid.appendChild(createAcquisitionCard({ acq, x: 0, y: 0 }, index));
    });
    tray.appendChild(grid);
    inner.appendChild(tray);
  }

  function renderExplore(inner, list, mid) {
    const canvas = $("#acq-canvas");
    const cardW = exploreCardWidth();
    const gap = 12;
    const HUB_HALF = 20; // overflow cluster (hub + satellite dots) half-extent
    const HUB_GAP = 8;
    const MARKER_CLEARANCE = 25; // compact marker radius (17px) + margin
    // Cards render with --ty as their *top* edge, so a lane above the mid
    // line grows downward toward the year-marker row as its rendered height
    // (tier-dependent) increases. Keep laneH big enough that even the
    // tallest current tier can't reach the compact marker.
    const cardH = estimateExploreCardHeight();
    const desiredLaneH = Math.round(128 * Math.min(1.45, cardW / ACQ.cardW));
    const laneH = Math.max(desiredLaneH, 2 * (cardH + MARKER_CLEARANCE));
    const placements = layoutExploreCards(list, { mid, cardW, gap, laneH });

    // A promotion swap only reuses another card's lane slot (y); it never
    // re-validates horizontal spacing at the new x. Guard against introducing
    // an overlap with whatever else already occupies that lane row.
    const fitsLane = (y, x, excludeId) => !placements.some(placement =>
      !placement.overflow && placement.y === y && placement.acq.id !== excludeId &&
      Math.abs(placement.x - x) < cardW + gap);

    if (ACQ.focusedId) {
      const selected = placements.find(placement =>
        placement.overflow && placement.acq.id === ACQ.focusedId);
      const replacement = selected && placements.slice().reverse().find(placement =>
        !placement.overflow &&
        placement.acq.announced.slice(0, 4) === selected.year &&
        placement.acq.id !== ACQ.focusedId &&
        fitsLane(placement.y, selected.x, placement.acq.id));
      if (selected && replacement) {
        selected.overflow = false;
        selected.y = replacement.y;
        replacement.overflow = true;
        replacement.year = selected.year;
      }
    }
    if (ACQ.anchorYear != null) {
      const year = String(ACQ.anchorYear);
      const promoted = placements.find(placement =>
        placement.overflow && placement.year === year && placement.acq.featured);
      const replaced = promoted && placements.slice().reverse().find(placement =>
        !placement.overflow &&
        placement.acq.announced.startsWith(year) &&
        !placement.acq.featured &&
        placement.acq.id !== ACQ.focusedId &&
        fitsLane(placement.y, promoted.x, placement.acq.id));
      if (promoted && replaced) {
        promoted.overflow = false;
        promoted.y = replaced.y;
        replaced.overflow = true;
        replaced.year = year;
      }
    }

    const overflows = new Map();
    placements.forEach(placement => {
      if (!placement.overflow) return;
      const bucket = overflows.get(placement.year) || [];
      bucket.push(placement);
      overflows.set(placement.year, bucket);
    });

    // When the canvas is too short for any y to clear both a card lane and
    // the year-marker band (e.g. mobile with the focus panel docked below
    // the canvas), a floating hub can never avoid colliding with something.
    // In that squeeze, merge the "+N" affordance directly onto the year
    // marker instead of rendering an independent node, which guarantees
    // zero added collision risk since no new element is placed at all.
    const cramped = mid < HUB_HALF + MARKER_CLEARANCE;
    const mergedYears = cramped ? new Set(overflows.keys()) : new Set();

    renderYearMarkers(inner, list, mid, { explore: true, mergedYears });
    renderLandmarks(inner, list);
    if (ACQ.expandedYear != null) {
      renderExpandedYear(inner, list, canvas);
      return;
    }

    const viewportWidth = canvas?.clientWidth || 1440;
    const scrollLeft = canvas?.scrollLeft || 0;
    const minX = scrollLeft - viewportWidth;
    const maxX = scrollLeft + viewportWidth * 2;

    placements.forEach((placement, index) => {
      if (placement.overflow) return;
      if (placement.x + cardW < minX || placement.x > maxX) return;
      inner.appendChild(createAcquisitionCard(placement, index));
    });

    // Prefer slotting each overflow cluster's hub into whichever real lane
    // has room at its x (outermost lanes first, so precious inner lanes stay
    // free for cards), using a full 2D box check (not just the lane's y)
    // so the hub can't overlap a card's actual rendered height either. If
    // no lane has room, fall back to scanning for any clear vertical slot
    // on the canvas, clear of both cards and the year-marker row.
    const laneOrder = [-3, 3, -2, 2, -1, 1];
    const hubLaneY = laneOrder.map(lane => mid + lane * laneH / 2);
    const placedHubs = [];
    const fitsHub = (y, x, skipMarkerClearance) =>
      y - HUB_HALF >= 0 && y + HUB_HALF <= 2 * mid &&
      (skipMarkerClearance || Math.abs(y - mid) >= MARKER_CLEARANCE + HUB_HALF) &&
      !placements.some(placement =>
        !placement.overflow &&
        x - HUB_HALF < placement.x + cardW && x + HUB_HALF > placement.x &&
        y - HUB_HALF < placement.y + cardH && y + HUB_HALF > placement.y) &&
      !placedHubs.some(hub =>
        Math.abs(hub.y - y) < HUB_HALF * 2 + HUB_GAP && Math.abs(hub.x - x) < HUB_HALF * 2 + HUB_GAP);
    const findHubY = x => {
      const laneMatch = hubLaneY.find(y => fitsHub(y, x));
      if (laneMatch != null) return laneMatch;
      for (let y = HUB_HALF; y <= 2 * mid - HUB_HALF; y += 4) {
        if (fitsHub(y, x)) return y;
      }
      // Last resort: allow encroaching on the year-marker clearance band (a
      // rare, tight overlap with a marker is far less disruptive than a
      // guaranteed collision with a card) but still respect card/hub bounds.
      for (let y = HUB_HALF; y <= 2 * mid - HUB_HALF; y += 4) {
        if (fitsHub(y, x, true)) return y;
      }
      return Math.max(HUB_HALF, Math.min(2 * mid - HUB_HALF, mid - laneH * 1.5 - HUB_HALF - HUB_GAP));
    };

    overflows.forEach((items, year) => {
      if (mergedYears.has(year)) return; // handled by the year marker itself
      const x = yearX(Number(year), 6);
      if (x < minX || x > maxX) return;
      const y = findHubY(x);
      placedHubs.push({ x, y });
      renderOverflowCluster(inner, year, items, y);
    });
  }

  function renderCards(inner) {
    const active = document.activeElement;
    const focusTarget = active?.classList?.contains("acq-card")
      ? { type: "card", value: active.dataset.id }
      : active?.classList?.contains("acq-year-marker")
        ? { type: "year", value: active.dataset.year }
        : active?.classList?.contains("acq-landmark")
          ? { type: "landmark", value: active.dataset.id }
          : active?.classList?.contains("acq-overflow-marker")
            ? { type: "overflow", value: active.getAttribute("aria-label") }
            : null;
    inner.querySelectorAll(
      ".acq-year-marker, .acq-landmark, .acq-card, .acq-overflow-marker, .acq-year-expansion"
    ).forEach(e => e.remove());
    const list = filteredList();
    const canvas = $("#acq-canvas");
    const mid = canvas ? canvas.clientHeight / 2 : 210;
    ACQ.level = getSemanticLevel();
    inner.dataset.represented = String(list.length);
    if (ACQ.level === "overview") renderOverview(inner, list, mid);
    else renderExplore(inner, list, mid);
    applySearchSpotlight();
    if (focusTarget) {
      let target = null;
      if (focusTarget.type === "card") {
        target = inner.querySelector(`.acq-card[data-id="${CSS.escape(focusTarget.value)}"]`);
      } else if (focusTarget.type === "year") {
        target = inner.querySelector(`.acq-year-marker[data-year="${CSS.escape(focusTarget.value)}"]`);
      } else if (focusTarget.type === "landmark") {
        target = inner.querySelector(`.acq-landmark[data-id="${CSS.escape(focusTarget.value)}"]`);
      } else if (focusTarget.type === "overflow") {
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
    track.setAttribute("aria-valuemin", String(ACQ.yearMin));
    track.setAttribute("aria-valuemax", String(ACQ.yearMax));

    dots.innerHTML = "";
    const list = window.CPN_ACQUISITIONS?.acquisitions || [];
    const w = track.clientWidth || 400;
    const span = ACQ.yearMax - ACQ.yearMin || 1;
    list.forEach(a => {
      const y = +a.announced.slice(0, 4);
      const dot = document.createElement("div");
      dot.className = "acq-mini-dot" + (a.featured ? " featured" : "");
      dot.style.left = `${((y - ACQ.yearMin) / span) * 100}%`;
      const scale = miniDotScale(a.valueUsd);
      dot.style.setProperty("--acq-dot-scale", String(scale));
      dots.appendChild(dot);
    });

    const canvas = $("#acq-canvas");
    if (!canvas || !vp) return;
    const innerW = innerWidth();
    const ratio = w / innerW;
    vp.style.width = `${Math.max(24, canvas.clientWidth * ratio)}px`;
    vp.style.left = `${canvas.scrollLeft * ratio}px`;
    const center = canvas.scrollLeft + canvas.clientWidth / 2;
    const currentYear = Math.round(
      ACQ.yearMin + (center - 120) / (ACQ.pxPerYear * ACQ.zoom)
    );
    track.setAttribute(
      "aria-valuenow",
      String(Math.max(ACQ.yearMin, Math.min(ACQ.yearMax, currentYear)))
    );
  }

  function showMinimapScan(clientX) {
    const track = $("#acq-minimap-track");
    const scan = $("#acq-minimap-scan");
    if (!track || !scan || prefersReducedMotion()) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    scan.style.left = `${pct * 100}%`;
    scan.classList.add("show");
  }

  function hideMinimapScan() {
    $("#acq-minimap-scan")?.classList.remove("show");
  }

  function flashMinimapScanAt(pct) {
    const scan = $("#acq-minimap-scan");
    if (!scan || prefersReducedMotion()) return;
    scan.style.left = `${Math.max(0, Math.min(1, pct)) * 100}%`;
    scan.classList.add("show");
    clearTimeout(scan._acqHideTimer);
    scan._acqHideTimer = setTimeout(() => scan.classList.remove("show"), 420);
  }

  function updateFocusIdentity(a) {
    const logo = $("#acq-focus-logo");
    const wordmark = $("#acq-focus-wordmark");
    if (!logo || !wordmark) return;
    const verified = a.visualIdentity?.kind === "verified-logo";
    logo.hidden = !verified;
    wordmark.hidden = verified;
    if (verified) {
      setLogoImg(logo, a);
      wordmark.textContent = "";
    } else {
      logo.removeAttribute("src");
      wordmark.textContent = a.company;
      wordmark.style.setProperty("--acq-era-color", eraColorFor(a.era));
    }
  }

  function renderFocusLives(a) {
    const lives = $("#acq-focus-lives");
    const path = $("#acq-focus-path");
    if (!lives) return;
    lives.innerHTML = "";
    const hasFamilies = Boolean(a.families?.length);
    if (path) {
      path.hidden = !hasFamilies;
      path.classList.remove("animate");
    }
    if (!hasFamilies) {
      lives.hidden = true;
      return;
    }
    lives.hidden = false;
    const label = document.createElement("span");
    label.className = "acq-focus-lives-label";
    label.textContent = "Signal continues as";
    lives.appendChild(label);
    a.families.slice(0, 4).forEach(famId => {
      const fam = window.nodeById?.[famId];
      const chip = document.createElement("span");
      chip.className = "acq-focus-live-chip";
      chip.textContent = fam?.name || famId;
      lives.appendChild(chip);
    });
    if (path) requestAnimationFrame(() => path.classList.add("animate"));
  }

  function focusAcquisition(id) {
    const activeCard = document.activeElement?.closest?.(".acq-card");
    ACQ.focusReturnId = activeCard?.dataset.id || id;
    ACQ.focusedId = id;
    const a = window.CPN_ACQUISITIONS?.acquisitions?.find(x => x.id === id);
    const panel = $("#acq-focus");
    if (!a || !panel) return;
    ACQ.anchorYear = Number(a.announced.slice(0, 4));
    ACQ.expandedYear = null;
    panel.hidden = false;
    panel.inert = false;
    panel.setAttribute("aria-hidden", "false");
    panel.classList.add("show");
    panel.style.setProperty("--acq-era-color", eraColorFor(a.era));
    updateFocusIdentity(a);
    $("#acq-focus-title").textContent = a.company;
    const headline = $("#acq-focus-headline");
    if (headline) headline.textContent = summaryHeadline(a);
    $("#acq-focus-meta").textContent = [
      formatAnnouncedDate(a.announced),
      a.valueUsd ? formatValue(a.valueUsd) : null,
      a.business || null,
      a.country || null,
    ].filter(Boolean).join(" · ");
    $("#acq-focus-summary").textContent = a.summary || a.business || "Cisco acquisition.";
    renderFocusLives(a);
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
    restoreCardFocus(id);
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
      const dx = Math.sin(t / 3000 + ph) * 12;
      const dy = Math.cos(t / 4000 + ph) * 8;
      p.style.transform = `translate(${dx}px, ${dy}px)`;
    });

    renderMinimap();
    updateCurrentPeriod();
  }

  function updateSpendTicker() {
    const el = $("#acq-spend-ticker");
    if (!el) return;
    const year = getCenterYear();
    const spend = cumulativeSpendThroughYear(year);
    el.textContent = spend > 0
      ? `${formatValue(spend)} disclosed through ${year}`
      : `Exploring ${year}`;
  }

  function updateCurrentPeriod() {
    const canvas = $("#acq-canvas");
    const label = $("#acq-current-period");
    if (!canvas || !label) return;
    const year = getCenterYear();
    if (getSemanticLevel() === "overview") {
      const era = (window.CPN_ACQUISITIONS?.eraBands || [])
        .find(band => year >= band.from && year <= band.to);
      label.textContent = era?.label || String(year);
    } else {
      label.textContent = String(year);
    }
    updateSpendTicker();
  }

  function applySearchSpotlight() {
    const wrap = $("#acq-wrap");
    if (!wrap) return;
    const q = ACQ.searchQuery.trim();
    if (!q) {
      ACQ.searchHighlightIds = null;
      wrap.classList.remove("acq-spotlight");
      $("#acq-inner")?.querySelectorAll(".acq-card, .acq-landmark").forEach(node => {
        node.classList.remove("locked", "spotlight-dim");
      });
      return;
    }
    const ids = new Set(searchAcquisitions(q).map(a => a.id));
    ACQ.searchHighlightIds = ids;
    wrap.classList.add("acq-spotlight");
    $("#acq-inner")?.querySelectorAll(".acq-card").forEach(card => {
      const match = ids.has(card.dataset.id);
      card.classList.toggle("locked", match);
      card.classList.toggle("spotlight-dim", !match);
    });
    $("#acq-inner")?.querySelectorAll(".acq-landmark").forEach(node => {
      const match = ids.has(node.dataset.id);
      node.classList.toggle("locked", match);
      node.classList.toggle("spotlight-dim", !match);
    });
  }

  function stopTour() {
    if (ACQ.tourTimer) clearInterval(ACQ.tourTimer);
    ACQ.tourTimer = null;
    ACQ.tourIndex = -1;
    $("#acq-tour")?.classList.remove("active");
    $("#acq-inner")?.querySelectorAll(".acq-landmark.tour-active").forEach(el => {
      el.classList.remove("tour-active");
    });
  }

  function startTour() {
    stopTour();
    const stops = LANDMARK_IDS
      .map(id => window.CPN_ACQUISITIONS?.acquisitions?.find(a => a.id === id))
      .filter(Boolean);
    if (!stops.length) return;
    $("#acq-tour")?.classList.add("active");
    ACQ.tourIndex = 0;
    const advance = () => {
      const acq = stops[ACQ.tourIndex];
      if (ACQ.zoom < 0.85) ACQ.zoom = 1.05;
      updateZoomUi();
      focusAcquisition(acq.id);
      $("#acq-inner")?.querySelectorAll(".acq-landmark.tour-active").forEach(el => {
        el.classList.remove("tour-active");
      });
      $(`#acq-inner .acq-landmark[data-id="${CSS.escape(acq.id)}"]`)?.classList.add("tour-active");
      ACQ.tourIndex = (ACQ.tourIndex + 1) % stops.length;
    };
    advance();
    ACQ.tourTimer = setInterval(advance, prefersReducedMotion() ? 8000 : 4500);
  }

  function onScroll() {
    updateCurrentPeriod();
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

  function setAcqZoom(z, anchorClientX = null) {
    const canvas = $("#acq-canvas");
    const prev = ACQ.zoom;
    const next = Math.max(ACQ.minZoom, Math.min(ACQ.maxZoom, z));
    if (!canvas) {
      ACQ.zoom = next;
      updateZoomUi();
      renderAcquisitionTimeline();
      updateParallax();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const viewportX = anchorClientX == null
      ? canvas.clientWidth / 2
      : anchorClientX - rect.left;
    const contentX = canvas.scrollLeft + viewportX;
    const timelineFrac = (contentX - 120) / (ACQ.pxPerYear * prev);

    ACQ.zoom = next;
    updateZoomUi();
    renderAcquisitionTimeline();

    const newContentX = timelineFrac * ACQ.pxPerYear * next + 120;
    const maxScroll = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
    canvas.scrollLeft = Math.max(0, Math.min(maxScroll, newContentX - viewportX));
    updateCanvasNameTier();
    updateParallax();
  }

  function bindCanvasNavigation(canvas) {
    if (!canvas || canvas.dataset.acqNavBound === "1") return;
    canvas.dataset.acqNavBound = "1";

    const PAN_THRESHOLD = 5;
    let pan = null;

    function maxScrollLeft() {
      return Math.max(0, canvas.scrollWidth - canvas.clientWidth);
    }

    function isPanTarget(el) {
      return el?.closest("#acq-canvas") &&
        !el.closest(".acq-year-expansion, button, a, input");
    }

    canvas.addEventListener("wheel", ev => {
      if (!$("#acq-wrap")?.classList.contains("show")) return;
      if (Math.abs(ev.deltaY) >= Math.abs(ev.deltaX)) {
        ev.preventDefault();
        setAcqZoom(ACQ.zoom * (ev.deltaY > 0 ? 0.92 : 1.08), ev.clientX);
        return;
      }
      if (ev.deltaX !== 0) {
        ev.preventDefault();
        canvas.scrollLeft = Math.max(0, Math.min(maxScrollLeft(), canvas.scrollLeft + ev.deltaX));
        onScroll();
      }
    }, { passive: false });

    canvas.addEventListener("pointerdown", ev => {
      if (ev.button !== 0 || !isPanTarget(ev.target)) return;
      pan = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startScroll: canvas.scrollLeft,
        moved: false,
      };
      canvas.setPointerCapture(ev.pointerId);
    });

    canvas.addEventListener("pointermove", ev => {
      if (!pan || ev.pointerId !== pan.pointerId) return;
      const dx = ev.clientX - pan.startX;
      if (!pan.moved && Math.abs(dx) <= PAN_THRESHOLD) return;
      pan.moved = true;
      canvas.classList.add("is-panning");
      canvas.scrollLeft = Math.max(0, Math.min(maxScrollLeft(), pan.startScroll - dx));
      onScroll();
    });

    function endPan(ev) {
      if (!pan || ev.pointerId !== pan.pointerId) return;
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
      canvas.classList.remove("is-panning");
      pan = null;
    }

    canvas.addEventListener("pointerup", endPan);
    canvas.addEventListener("pointercancel", endPan);
  }

  function fitAcqZoom() {
    const canvas = $("#acq-canvas");
    if (!canvas) return;
    stopTour();
    clearAcquisitionFocus({ restoreFocus: false });
    ACQ.anchorYear = null;
    ACQ.expandedYear = null;
    ACQ.zoom = ACQ.minZoom;
    ACQ.level = "overview";
    updateZoomUi();
    renderAcquisitionTimeline();
    canvas.scrollTo({ left: 0, behavior: "auto" });
    canvas.scrollLeft = 0;
    renderCards($("#acq-inner"));
    updateParallax();
    updateCanvasNameTier();
    // The inner track shrinks when zooming to fit; Chrome's scroll-anchoring
    // heuristic can nudge scrollLeft off 0 on the next frame to compensate.
    // Re-assert after layout settles.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (canvas.scrollLeft !== 0) canvas.scrollLeft = 0;
    }));
  }

  function clearAcquisitionFocus({ restoreFocus = true } = {}) {
    const returnId = ACQ.focusReturnId || ACQ.focusedId;
    ACQ.focusedId = null;
    const panel = $("#acq-focus");
    if (panel) {
      panel.classList.remove("show");
      panel.hidden = true;
      panel.inert = true;
      panel.setAttribute("aria-hidden", "true");
    }
    renderAcquisitionTimeline();
    if (!restoreFocus) return;
    const card = returnId
      ? $(`#acq-inner .acq-card[data-id="${CSS.escape(returnId)}"]`)
      : null;
    if (!focusVisible(card)) focusVisible($("#acq-canvas"));
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
    updateCanvasNameTier();
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
    applySearchSpotlight();
    updateParallax();
  }

  function renderSearchResults() {
    const popup = $("#acq-search-results");
    const input = $("#acq-search");
    if (!popup || !input) return [];
    const results = searchAcquisitions(input.value);
    ACQ.searchQuery = input.value;
    ACQ.searchActiveIndex = -1;
    applySearchSpotlight();
    popup.innerHTML = "";
    results.slice(0, 8).forEach((acq, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "acq-search-result";
      option.id = `acq-search-result-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = -1;
      option.dataset.id = acq.id;
      option.textContent = `${acq.company} · ${formatAnnouncedDate(acq.announced)}`;
      option.addEventListener("click", () => {
        selectSearchResult(acq);
      });
      popup.appendChild(option);
    });
    popup.hidden = !results.length;
    input.setAttribute("aria-expanded", String(results.length > 0));
    input.removeAttribute("aria-activedescendant");
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
    ACQ.searchActiveIndex = -1;
    applySearchSpotlight();
  }

  function setActiveSearchOption(index) {
    const input = $("#acq-search");
    const options = [...$("#acq-search-results")?.querySelectorAll("[role='option']") || []];
    if (!input || !options.length) return null;
    ACQ.searchActiveIndex = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
      option.setAttribute("aria-selected", String(optionIndex === ACQ.searchActiveIndex));
    });
    const active = options[ACQ.searchActiveIndex];
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
    return active;
  }

  function setFilter(filter, label, { render = true, restoreFocus = true } = {}) {
    ACQ.filter = filter;
    ACQ.focusedId = null;
    ACQ.expandedYear = null;
    const focusPanel = $("#acq-focus");
    if (focusPanel) {
      focusPanel.classList.remove("show");
      focusPanel.hidden = true;
      focusPanel.inert = true;
      focusPanel.setAttribute("aria-hidden", "true");
    }
    const button = $("#acq-filter-btn");
    const menu = $("#acq-filter-menu");
    if (button) {
      button.textContent = `Filters: ${label}`;
      button.setAttribute("aria-expanded", "false");
    }
    if (menu) menu.hidden = true;
    menu?.querySelectorAll("[data-acq-filter]").forEach(item => {
      const selected = item.dataset.acqFilter === filter;
      item.setAttribute("aria-checked", String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    if (render) renderAcquisitionTimeline();
    if (restoreFocus) focusVisible(button);
  }

  function selectSearchResult(acq) {
    setFilter("all", "All", { render: false, restoreFocus: false });
    clearSearchResults();
    focusAcquisition(acq.id);
  }

  function closeFilterMenu({ restoreFocus = false } = {}) {
    const menu = $("#acq-filter-menu");
    const button = $("#acq-filter-btn");
    if (menu) menu.hidden = true;
    button?.setAttribute("aria-expanded", "false");
    if (restoreFocus) focusVisible(button);
  }

  function setMenuRovingItem(target) {
    const items = $("#acq-filter-menu")?.querySelectorAll("[role='menuitemradio']") || [];
    items.forEach(item => {
      item.tabIndex = item === target ? 0 : -1;
    });
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
      item.tabIndex = filter.id === ACQ.filter ? 0 : -1;
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
    const nodes = [...document.querySelectorAll(".acq-year-marker, .acq-card, .acq-overflow-marker, .acq-landmark")];
    const rects = nodes.map(node => node.getBoundingClientRect()).filter(intersectsCanvas);
    const mountedIds = [...document.querySelectorAll(".acq-card")].map(el => el.dataset.id);
    const visibleIds = [...document.querySelectorAll(".acq-card")]
      .filter(el => intersectsCanvas(el.getBoundingClientRect()))
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
      maxZoom: ACQ.maxZoom,
      anchorYear: ACQ.anchorYear,
      expandedYear: ACQ.expandedYear,
      focusedId: ACQ.focusedId,
      reducedMotion: prefersReducedMotion(),
      scrollLeft: document.querySelector("#acq-canvas")?.scrollLeft || 0,
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
          <div class="acq-sub">${window.CPN_ACQUISITIONS.acquisitions.length} companies · scroll to zoom · drag to pan · click a node to explore · sources: Wikipedia & Cisco</div>
          <div id="acq-current-period" aria-live="polite"></div>
          <div id="acq-spend-ticker" aria-live="polite"></div>
        </div>
        <div class="acq-head-controls">
          <div class="acq-search-wrap">
            <label class="acq-sr-only" for="acq-search">Search acquisitions</label>
            <input id="acq-search" type="search" placeholder="Search acquisitions"
              role="combobox" aria-autocomplete="list" aria-controls="acq-search-results"
              aria-expanded="false" autocomplete="off"/>
            <div id="acq-search-results" role="listbox" hidden></div>
          </div>
          <button type="button" class="rc-btn acq-nav-btn" id="acq-tour" aria-label="Play landmark tour">Tour</button>
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
      <div id="acq-focus" aria-live="polite" aria-hidden="true" hidden inert>
        <div id="acq-focus-inner">
          <div id="acq-focus-visual">
            <img id="acq-focus-logo" alt="" width="72" height="72"/>
            <div id="acq-focus-wordmark" hidden></div>
          </div>
          <div>
            <h3 id="acq-focus-title"></h3>
            <div id="acq-focus-headline"></div>
            <div id="acq-focus-meta"></div>
            <div id="acq-focus-path" aria-hidden="true" hidden></div>
            <div id="acq-focus-lives" hidden></div>
            <div id="acq-focus-summary"></div>
            <a id="acq-focus-source" target="_blank" rel="noopener noreferrer" hidden></a>
          </div>
          <div id="acq-focus-actions">
            <button type="button" class="rc-btn" id="acq-focus-jump" hidden>View in portfolio →</button>
            <button type="button" class="rc-btn" id="acq-focus-clear">Clear selection</button>
          </div>
        </div>
      </div>
      <div id="acq-canvas-area">
        <div id="acq-canvas" tabindex="-1" role="region" aria-label="Acquisition timeline">
          <div id="acq-viewport-flow" aria-hidden="true"></div>
          <div id="acq-inner">
            <div id="acq-spine-wrap" class="acq-layer" data-depth="0.04"><div id="acq-spine"></div></div>
          </div>
        </div>
        <div id="acq-minimap">
          <div id="acq-minimap-track" role="slider" tabindex="0"
            aria-label="Timeline viewport year" aria-valuemin="${ACQ.yearMin}"
            aria-valuemax="${ACQ.yearMax}" aria-valuenow="${ACQ.yearMin}">
            <div id="acq-minimap-dots"></div><div id="acq-minimap-viewport"></div>
            <div id="acq-minimap-scan" aria-hidden="true"></div>
          </div>
          <div id="acq-minimap-labels"><span>${ACQ.yearMin}</span><span>${ACQ.yearMax}</span></div>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    buildParticles($("#acq-particles"));
    buildFilterMenu();

    const canvas = $("#acq-canvas");

    $("#acq-close")?.addEventListener("click", closeAcquisitionTimeline);
    $("#acq-focus-clear")?.addEventListener("click", () => clearAcquisitionFocus());
    $("#acq-zoom-in")?.addEventListener("click", () => {
      const rect = canvas?.getBoundingClientRect();
      setAcqZoom(ACQ.zoom * 1.25, rect ? rect.left + rect.width / 2 : null);
    });
    $("#acq-zoom-out")?.addEventListener("click", () => {
      const rect = canvas?.getBoundingClientRect();
      setAcqZoom(ACQ.zoom / 1.25, rect ? rect.left + rect.width / 2 : null);
    });
    $("#acq-zoom-fit")?.addEventListener("click", fitAcqZoom);
    $("#acq-tour")?.addEventListener("click", () => {
      if ($("#acq-tour")?.classList.contains("active")) stopTour();
      else startTour();
    });
    $("#acq-prev")?.addEventListener("click", () => focusRelative(-1));
    $("#acq-next")?.addEventListener("click", () => focusRelative(1));
    $("#acq-search")?.addEventListener("input", renderSearchResults);
    $("#acq-search")?.addEventListener("keydown", event => {
      const options = [...$("#acq-search-results")?.querySelectorAll("[role='option']") || []];
      if (event.key === "ArrowDown" || event.key === "ArrowUp" ||
          event.key === "Home" || event.key === "End") {
        if (!options.length) return;
        event.preventDefault();
        const nextIndex = event.key === "ArrowDown"
          ? ACQ.searchActiveIndex + 1
          : event.key === "ArrowUp"
            ? (ACQ.searchActiveIndex < 0 ? options.length - 1 : ACQ.searchActiveIndex - 1)
            : event.key === "Home" ? 0 : options.length - 1;
        setActiveSearchOption(nextIndex);
      } else if (event.key === "Enter") {
        const activeOption = options[ACQ.searchActiveIndex] || options[0];
        const selected = (window.CPN_ACQUISITIONS?.acquisitions || [])
          .find(acq => acq.id === activeOption?.dataset.id);
        if (!selected) return;
        event.preventDefault();
        selectSearchResult(selected);
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
      if (open) {
        const selected = menu?.querySelector('[aria-checked="true"]');
        setMenuRovingItem(selected);
        focusVisible(selected);
      }
    });
    $("#acq-filter-menu")?.addEventListener("keydown", event => {
      const items = [...event.currentTarget.querySelectorAll("[role='menuitemradio']")];
      const current = items.indexOf(document.activeElement);
      let target = null;
      if (event.key === "ArrowDown") target = items[(current + 1 + items.length) % items.length];
      else if (event.key === "ArrowUp") target = items[(current - 1 + items.length) % items.length];
      else if (event.key === "Home") target = items[0];
      else if (event.key === "End") target = items.at(-1);
      else if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        closeFilterMenu();
        focusVisible(event.shiftKey ? $("#acq-filter-btn") : $("#acq-close"));
        return;
      }
      else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFilterMenu({ restoreFocus: true });
        return;
      }
      if (target) {
        event.preventDefault();
        setMenuRovingItem(target);
        focusVisible(target);
      }
    });
    document.addEventListener("click", event => {
      if (event.target.closest(".acq-filter-wrap")) return;
      closeFilterMenu();
    });
    document.addEventListener("keydown", event => {
      if (!$("#acq-wrap")?.classList.contains("show")) return;
      if (event.key === "Escape") {
        if (ACQ.searchQuery) {
          clearSearchResults();
        } else if (!$("#acq-filter-menu")?.hidden) {
          closeFilterMenu({ restoreFocus: true });
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

    canvas?.addEventListener("scroll", onScroll, { passive: true });
    bindCanvasNavigation(canvas);

    const minimapTrack = $("#acq-minimap-track");
    minimapTrack?.addEventListener("click", ev => {
      const rect = minimapTrack.getBoundingClientRect();
      const pct = (ev.clientX - rect.left) / rect.width;
      const innerW = innerWidth();
      canvas.scrollLeft = pct * innerW - canvas.clientWidth / 2;
      flashMinimapScanAt(pct);
      onScroll();
    });
    minimapTrack?.addEventListener("pointerdown", ev => showMinimapScan(ev.clientX));
    minimapTrack?.addEventListener("pointermove", ev => {
      if (ev.buttons) showMinimapScan(ev.clientX);
    });
    minimapTrack?.addEventListener("pointerup", hideMinimapScan);
    minimapTrack?.addEventListener("pointerleave", hideMinimapScan);
    minimapTrack?.addEventListener("keydown", event => {
      const maxScroll = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
      const yearStep = ACQ.pxPerYear * ACQ.zoom;
      let left = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        left = canvas.scrollLeft - yearStep;
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        left = canvas.scrollLeft + yearStep;
      } else if (event.key === "Home") {
        left = 0;
      } else if (event.key === "End") {
        left = maxScroll;
      }
      if (left == null) return;
      event.preventDefault();
      event.stopPropagation();
      canvas.scrollLeft = Math.max(0, Math.min(maxScroll, left));
      const innerW = innerWidth();
      flashMinimapScanAt((canvas.scrollLeft + canvas.clientWidth / 2) / innerW);
      onScroll();
    });

    const tBtn = document.createElement("button");
    tBtn.type = "button";
    tBtn.className = "tools-btn";
    tBtn.id = "tools-acquisitions";
    tBtn.innerHTML = `<span class="ti">◆</span><span>Acquisitions Timeline</span>`;
    tBtn.title = "Acquisitions Timeline — interactive logo timeline (M)";
    tBtn.addEventListener("click", () => {
      if ($("#acq-wrap")?.classList.contains("show")) closeAcquisitionTimeline();
      else openAcquisitionTimeline();
    });
    const tools = $("#tools");
    if (tools?.firstChild) tools.insertBefore(tBtn, tools.firstChild);
    else tools?.appendChild(tBtn);

    updateZoomUi();
    renderAcquisitionTimeline();

    function animLoop() {
      if ($("#acq-wrap")?.classList.contains("show")) updateParallax();
      requestAnimationFrame(animLoop);
    }
    requestAnimationFrame(animLoop);
  }

  function openAcquisitionTimeline() {
    const active = document.activeElement;
    ACQ.opener = isVisible(active) ? active : null;
    $("#acq-wrap")?.classList.add("show");
    document.body.classList.add("acq-open");
    $("#tools-acquisitions")?.classList.add("active");
    window.__cpnV2?.phases?.closeTimelineView?.();
    renderAcquisitionTimeline();
    fitAcqZoom();
    $("#acq-search")?.focus({ preventScroll: true });
  }

  function closeAcquisitionTimeline() {
    const opener = ACQ.opener;
    stopTour();
    $("#acq-wrap")?.classList.remove("show");
    document.body.classList.remove("acq-open");
    $("#tools-acquisitions")?.classList.remove("active");
    ACQ.focusedId = null;
    ACQ.expandedYear = null;
    clearSearchResults();
    const focusPanel = $("#acq-focus");
    if (focusPanel) {
      focusPanel.classList.remove("show");
      focusPanel.hidden = true;
      focusPanel.inert = true;
      focusPanel.setAttribute("aria-hidden", "true");
    }
    ACQ.opener = null;
    focusVisible(opener);
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
    formatAnnouncedDate,
    testState,
  };
})();
