#!/usr/bin/env node
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const errors = [];
const browser = await chromium.launch();

async function assertOverviewCoverage(page, label) {
  const coverage = await page.evaluate(() => {
    const acquisitionYears = window.CPN_ACQUISITIONS.acquisitions
      .map(acquisition => acquisition.announced.slice(0, 4));
    const expectedYears = [...new Set(acquisitionYears)].sort();
    const markers = [...document.querySelectorAll(".acq-year-marker")].map(marker => ({
      year: marker.dataset.year,
      count: Number(marker.querySelector(".acq-year-marker-count")?.textContent),
    }));
    const markerYears = markers.map(marker => marker.year);
    return {
      totalCount: acquisitionYears.length,
      markerCountTotal: markers.reduce((sum, marker) => sum + marker.count, 0),
      duplicateYears: markerYears.filter((year, index) => markerYears.indexOf(year) !== index),
      missingYears: expectedYears.filter(year => !markerYears.includes(year)),
      unexpectedYears: markerYears.filter(year => !expectedYears.includes(year)),
    };
  });
  if (coverage.markerCountTotal !== coverage.totalCount) {
    errors.push(`${label}: marker counts ${coverage.markerCountTotal}/${coverage.totalCount}`);
  }
  if (coverage.duplicateYears.length) {
    errors.push(`${label}: duplicate year markers ${coverage.duplicateYears.join(",")}`);
  }
  if (coverage.missingYears.length || coverage.unexpectedYears.length) {
    errors.push(
      `${label}: year coverage missing=${coverage.missingYears.join(",")} ` +
      `unexpected=${coverage.unexpectedYears.join(",")}`
    );
  }
}

async function assertLayout(page, label, { focus = false } = {}) {
  const layout = await page.evaluate(checkFocus => {
    const state = window.CPN_AcquisitionTimeline.testState();
    const canvasRect = document.querySelector("#acq-canvas").getBoundingClientRect();
    const timelineNodes = [...document.querySelectorAll(
      ".acq-year-marker, .acq-card, .acq-overflow-marker"
    )].filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.left < canvasRect.right && rect.right > canvasRect.left &&
        rect.top < canvasRect.bottom && rect.bottom > canvasRect.top;
    });
    const overlapPairs = [];
    for (let i = 0; i < timelineNodes.length; i += 1) {
      for (let j = i + 1; j < timelineNodes.length; j += 1) {
        const a = timelineNodes[i].getBoundingClientRect();
        const b = timelineNodes[j].getBoundingClientRect();
        const overlaps = a.left < b.right && a.right > b.left &&
          a.top < b.bottom && a.bottom > b.top;
        if (overlaps) {
          overlapPairs.push([
            timelineNodes[i].dataset.id || timelineNodes[i].getAttribute("aria-label"),
            timelineNodes[j].dataset.id || timelineNodes[j].getAttribute("aria-label"),
          ].join("/"));
        }
      }
    }
    const selectors = [
      "#acq-wrap", "#acq-head", ".acq-head-controls", "#acq-search",
      "#acq-prev", "#acq-next", ".acq-zoom", "#acq-filter-btn",
      "#acq-close", "#acq-minimap",
    ];
    if (checkFocus) {
      selectors.push(
        "#acq-focus", "#acq-focus-inner", "#acq-focus-actions",
        "#acq-focus-source", "#acq-focus-jump", "#acq-focus-clear"
      );
    }
    const tolerance = 1;
    const outOfBounds = selectors.flatMap(selector => {
      const element = document.querySelector(selector);
      if (!element || !element.getClientRects().length) return [];
      const rect = element.getBoundingClientRect();
      return rect.left < -tolerance || rect.top < -tolerance ||
        rect.right > innerWidth + tolerance || rect.bottom > innerHeight + tolerance
        ? [selector]
        : [];
    });
    const focusPanel = document.querySelector("#acq-focus");
    const focusActions = document.querySelector("#acq-focus-actions");
    const focusRect = focusPanel?.getBoundingClientRect();
    const actionsRect = focusActions?.getBoundingClientRect();
    const focusControlsClipped = checkFocus &&
      [...document.querySelectorAll("#acq-focus button, #acq-focus a")]
        .filter(control => control.getClientRects().length)
        .some(control => {
          const rect = control.getBoundingClientRect();
          return rect.left < focusRect.left - tolerance ||
            rect.top < focusRect.top - tolerance ||
            rect.right > focusRect.right + tolerance ||
            rect.bottom > focusRect.bottom + tolerance;
        });
    return {
      overlapCount: state.overlapCount,
      overlapPairs,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      outOfBounds,
      focusClipped: checkFocus && (
        focusPanel.scrollHeight > focusPanel.clientHeight + tolerance ||
        actionsRect.left < focusRect.left - tolerance ||
        actionsRect.top < focusRect.top - tolerance ||
        actionsRect.right > focusRect.right + tolerance ||
        actionsRect.bottom > focusRect.bottom + tolerance ||
        focusControlsClipped
      ),
    };
  }, focus);
  if (layout.overlapCount !== 0) {
    errors.push(`${label}: ${layout.overlapCount} overlaps (${layout.overlapPairs.join(",")})`);
  }
  if (layout.horizontalOverflow) {
    errors.push(`${label}: page-level horizontal overflow`);
  }
  if (layout.outOfBounds.length) {
    errors.push(`${label}: out of bounds ${layout.outOfBounds.join(",")}`);
  }
  if (layout.focusClipped) {
    errors.push(`${label}: focus panel or controls clipped`);
  }
}

async function assertAllAcquisitionsReachable(page, label) {
  const yearGroups = await page.evaluate(() => {
    const groups = new Map();
    window.CPN_ACQUISITIONS.acquisitions.forEach(acquisition => {
      const year = acquisition.announced.slice(0, 4);
      const ids = groups.get(year) || [];
      ids.push(acquisition.id);
      groups.set(year, ids);
    });
    return [...groups].map(([year, ids]) => ({ year, ids }));
  });
  const reached = new Set();

  for (const { year, ids } of yearGroups) {
    await page.locator(`.acq-year-marker[data-year="${year}"]`).evaluate(marker => marker.click());
    await page.waitForFunction(expectedYear => {
      const state = window.CPN_AcquisitionTimeline.testState();
      return state.level === "explore" && state.anchorYear === Number(expectedYear);
    }, year);
    await page.evaluate(expectedYear => {
      window.CPN_AcquisitionTimeline.setZoom(2.4);
      const canvas = document.querySelector("#acq-canvas");
      canvas.scrollLeft = (Number(expectedYear) - 1993) * 72 * 2.4 +
        120 - canvas.clientWidth / 2;
      canvas.dispatchEvent(new Event("scroll"));
    }, year);
    await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const overflowMarker = page.locator(`.acq-overflow-marker[aria-label*="from ${year}"]`);
    if (await overflowMarker.count()) {
      await overflowMarker.evaluate(marker => marker.click());
      await page.waitForFunction(expectedYear =>
        window.CPN_AcquisitionTimeline.testState().expandedYear === Number(expectedYear),
      year);
      const expandedIds = await page.locator(".acq-year-expansion .acq-card")
        .evaluateAll(cards => cards.map(card => card.dataset.id));
      expandedIds.forEach(id => reached.add(id));
      const missingFromExpansion = ids.filter(id => !expandedIds.includes(id));
      if (missingFromExpansion.length) {
        errors.push(`${label}: ${year} expansion missing ${missingFromExpansion.join(",")}`);
      }
    } else {
      const visibleIds = await page.evaluate(() =>
        window.CPN_AcquisitionTimeline.testState().visibleIds);
      ids.filter(id => visibleIds.includes(id)).forEach(id => reached.add(id));
      const missingDirect = ids.filter(id => !visibleIds.includes(id));
      if (missingDirect.length) {
        errors.push(`${label}: ${year} direct reachability missing ${missingDirect.join(",")}`);
      }
    }

    await page.evaluate(() => window.CPN_AcquisitionTimeline.setZoom(0.55));
    await page.waitForFunction(() =>
      window.CPN_AcquisitionTimeline.testState().level === "overview");
  }

  const allIds = yearGroups.flatMap(group => group.ids);
  const unreachable = allIds.filter(id => !reached.has(id));
  if (unreachable.length) {
    errors.push(`${label}: unreachable acquisitions ${unreachable.join(",")}`);
  }
}

const cases = [
  { name: "desktop-dark", width: 1440, height: 900, theme: "dark", reducedMotion: "no-preference" },
  { name: "tablet-light", width: 1024, height: 768, theme: "light", reducedMotion: "no-preference" },
  { name: "mobile-reduced", width: 390, height: 844, theme: "dark", reducedMotion: "reduce" },
];

for (const testCase of cases) {
  const casePage = await browser.newPage({
    viewport: { width: testCase.width, height: testCase.height },
    reducedMotion: testCase.reducedMotion,
  });
  await casePage.addInitScript(theme => {
    localStorage.setItem("cpn-theme-v1", theme);
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }, testCase.theme);
  await casePage.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await casePage.waitForFunction(() => window.CPN_AcquisitionTimeline?.open);
  const rootTheme = await casePage.evaluate(() =>
    document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  if (rootTheme !== testCase.theme) {
    errors.push(`${testCase.name}: initialized theme ${rootTheme}`);
  }
  await casePage.evaluate(() => window.CPN_AcquisitionTimeline.open());
  await casePage.waitForSelector("#acq-wrap.show");

  await assertOverviewCoverage(casePage, `${testCase.name} overview`);
  await assertLayout(casePage, `${testCase.name} overview`);
  if (testCase.name === "desktop-dark") {
    await assertAllAcquisitionsReachable(casePage, testCase.name);
  }

  if (testCase.width <= 768) {
    const mobileHeader = await casePage.evaluate(() => {
      const head = document.querySelector("#acq-head");
      const controls = document.querySelector(".acq-head-controls");
      const search = document.querySelector("#acq-search");
      const headRect = head.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      const searchRect = search.getBoundingClientRect();
      return {
        direction: getComputedStyle(head).flexDirection,
        controlsDisplay: getComputedStyle(controls).display,
        controlsContained: controlsRect.left >= headRect.left &&
          controlsRect.right <= headRect.right,
        searchContained: searchRect.left >= controlsRect.left &&
          searchRect.right <= controlsRect.right,
      };
    });
    if (mobileHeader.direction !== "column") {
      errors.push(`${testCase.name}: header did not stack`);
    }
    if (mobileHeader.controlsDisplay !== "grid") {
      errors.push(`${testCase.name}: controls did not use compact grid`);
    }
    if (!mobileHeader.controlsContained || !mobileHeader.searchContained) {
      errors.push(`${testCase.name}: header controls overflowed`);
    }
  }

  if (testCase.width <= 1024) {
    await casePage.click('.acq-year-marker[data-year="2012"]');
    await casePage.waitForFunction(() =>
      window.CPN_AcquisitionTimeline.testState().level === "explore");
    await assertLayout(casePage, `${testCase.name} explore`);

    if (testCase.theme === "light") {
      const usesThemeCardSurface = await casePage.evaluate(() => {
        const card = document.querySelector(".acq-card-shell");
        const probe = document.createElement("div");
        probe.style.background = "var(--glass-bg)";
        document.body.append(probe);
        const matches = getComputedStyle(card).backgroundColor ===
          getComputedStyle(probe).backgroundColor;
        probe.remove();
        return matches;
      });
      if (!usesThemeCardSurface) {
        errors.push(`${testCase.name}: cards bypass light-theme surface variable`);
      }
    }

    await casePage.click('.acq-card[data-id="meraki"]');
    await casePage.waitForSelector("#acq-focus.show");
    await casePage.locator("#acq-focus").evaluate(element =>
      Promise.all(element.getAnimations().map(animation => animation.finished)));
    await assertLayout(casePage, `${testCase.name} focus`, { focus: true });

    if (testCase.width <= 768) {
      const focusMaxHeight = await casePage.locator("#acq-focus")
        .evaluate(element => getComputedStyle(element).maxHeight);
      if (focusMaxHeight !== "190px") {
        errors.push(`${testCase.name}: focus max-height ${focusMaxHeight}`);
      }
    }
  }
  await casePage.close();
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.CPN_AcquisitionTimeline?.open);
await page.evaluate(() => window.CPN_AcquisitionTimeline.open());
await page.waitForSelector("#acq-wrap.show");

const initial = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState());
if (initial.level !== "overview") errors.push(`initial level: ${initial.level}`);
await assertOverviewCoverage(page, "detailed overview");
if (initial.overlapCount !== 0) errors.push(`overview overlaps: ${initial.overlapCount}`);
if (initial.renderedCards >= initial.totalCount) errors.push("overview rendered every card");

await page.click('.acq-year-marker[data-year="2012"]');
await page.waitForFunction(() => window.CPN_AcquisitionTimeline.testState().level === "explore");
const explore = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState());
if (!explore.visibleIds.includes("meraki")) errors.push("2012 explore missing Meraki");
if (explore.overlapCount !== 0) errors.push(`explore overlaps: ${explore.overlapCount}`);
if (explore.anchorYear !== 2012) errors.push(`anchor year: ${explore.anchorYear}`);

await page.click('.acq-card[data-id="meraki"]');
await page.waitForFunction(() => window.CPN_AcquisitionTimeline.testState().focusedId === "meraki");
await page.click("#acq-zoom-fit");
await page.waitForFunction(() => window.CPN_AcquisitionTimeline.testState().level === "overview");
const fitFromFocus = await page.evaluate(() => {
  const state = window.CPN_AcquisitionTimeline.testState();
  const canvas = document.querySelector("#acq-canvas");
  return {
    state,
    scrollLeft: canvas.scrollLeft,
    panelShown: document.querySelector("#acq-focus").classList.contains("show"),
    panelHidden: document.querySelector("#acq-focus").hidden,
  };
});
if (fitFromFocus.state.focusedId != null || fitFromFocus.state.expandedYear != null) {
  errors.push("FIT retained focus or expanded-year state");
}
if (fitFromFocus.panelShown || !fitFromFocus.panelHidden) {
  errors.push("FIT did not hide the focus panel");
}
if (fitFromFocus.scrollLeft !== 0) errors.push(`FIT overview scroll: ${fitFromFocus.scrollLeft}`);
await assertLayout(page, "FIT from focus overview");

await page.click('.acq-year-marker[data-year="2012"]');
await page.waitForFunction(() => window.CPN_AcquisitionTimeline.testState().level === "explore");
await page.click('.acq-card[data-id="meraki"]');
await page.waitForFunction(() => window.CPN_AcquisitionTimeline.testState().focusedId === "meraki");
await page.click("#acq-focus-clear");
const clearedFocus = await page.evaluate(() => {
  const panel = document.querySelector("#acq-focus");
  const controls = [...panel.querySelectorAll("button, a")];
  return {
    hidden: panel.hidden,
    inert: panel.inert,
    focusableControls: controls.filter(control =>
      !control.hidden && control.tabIndex >= 0 && control.getClientRects().length).length,
    activeId: document.activeElement?.dataset?.id || document.activeElement?.id,
  };
});
if (!clearedFocus.hidden || !clearedFocus.inert || clearedFocus.focusableControls) {
  errors.push(`clear focus panel accessibility: ${JSON.stringify(clearedFocus)}`);
}
if (clearedFocus.activeId !== "meraki" && clearedFocus.activeId !== "acq-canvas") {
  errors.push(`clear focus restoration: ${clearedFocus.activeId}`);
}

await page.evaluate(() => window.CPN_AcquisitionTimeline.setZoom(2.4));
await page.waitForFunction(() =>
  window.CPN_AcquisitionTimeline.testState().zoom === 2.4 &&
  document.querySelector('.acq-overflow-marker[aria-label*="2012"]'));
const maxZoom = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState());
if (maxZoom.overlapCount !== 0) errors.push(`max-zoom marker overlaps: ${maxZoom.overlapCount}`);
if (maxZoom.overflowMarkers === 0) errors.push("max zoom had no overflow marker to test");

const initialExploreScroll = await page.locator("#acq-canvas").evaluate(el => el.scrollLeft);
const mountedBeforeScroll = maxZoom.mountedIds.join(",");
await page.locator("#acq-canvas").evaluate(el => {
  el.scrollLeft = el.scrollWidth - el.clientWidth;
});
await page.waitForFunction(before =>
  window.CPN_AcquisitionTimeline.testState().mountedIds.join(",") !== before,
mountedBeforeScroll);
const scrolled = await page.evaluate(() => {
  const state = window.CPN_AcquisitionTimeline.testState();
  const canvas = document.querySelector("#acq-canvas").getBoundingClientRect();
  const allVisible = [...document.querySelectorAll(".acq-card")]
    .filter(card => state.visibleIds.includes(card.dataset.id))
    .every(card => {
      const rect = card.getBoundingClientRect();
      return rect.left < canvas.right && rect.right > canvas.left &&
        rect.top < canvas.bottom && rect.bottom > canvas.top;
    });
  return { state, allVisible };
});
if (scrolled.state.mountedIds.join(",") === mountedBeforeScroll) {
  errors.push("scroll virtualization did not change mounted cards");
}
if (!scrolled.allVisible) errors.push("visibleIds included off-viewport cards");
if (scrolled.state.visibleIds.length >= scrolled.state.mountedIds.length) {
  errors.push("viewport visibility did not exclude buffered cards");
}
if (scrolled.state.anchorYear !== 2012) errors.push("scroll lost anchor year");

await page.locator("#acq-canvas").evaluate((el, left) => {
  el.scrollLeft = left;
}, initialExploreScroll);
await page.waitForFunction(() =>
  document.querySelector('.acq-overflow-marker[aria-label*="2012"]'));
await page.locator('.acq-overflow-marker[aria-label*="2012"]').evaluate(el => el.click());
await page.waitForFunction(() => window.CPN_AcquisitionTimeline.testState().expandedYear === 2012);
const expanded = await page.evaluate(() => ({
  state: window.CPN_AcquisitionTimeline.testState(),
  yearIds: window.CPN_ACQUISITIONS.acquisitions
    .filter(acq => acq.announced.startsWith("2012"))
    .map(acq => acq.id),
}));
const unreachable = expanded.yearIds.filter(id => !expanded.state.visibleIds.includes(id));
const previouslyOverflowed = expanded.yearIds.filter(id => !maxZoom.mountedIds.includes(id));
if (unreachable.length) errors.push(`expanded 2012 unreachable: ${unreachable.join(",")}`);
if (!previouslyOverflowed.length) errors.push("no max-zoom overflow acquisition identified");
if (expanded.state.zoom !== 2.4) errors.push(`expansion changed max zoom: ${expanded.state.zoom}`);
if (expanded.state.anchorYear !== 2012) errors.push("expansion lost anchor year");
if (expanded.state.overlapCount !== 0) errors.push(`expanded overlaps: ${expanded.state.overlapCount}`);
if (previouslyOverflowed[0]) {
  await page.locator(`.acq-card[data-id="${previouslyOverflowed[0]}"]`).evaluate(el => el.click());
  await page.waitForFunction(id =>
    window.CPN_AcquisitionTimeline.testState().focusedId === id,
  previouslyOverflowed[0]);
}

const searchResults = await page.locator("#acq-search-results").getAttribute("role");
if (searchResults !== "listbox") errors.push(`search results role: ${searchResults}`);

await page.fill("#acq-search", "security");
await page.keyboard.press("ArrowDown");
let comboState = await page.evaluate(() => ({
  activeDescendant: document.querySelector("#acq-search").getAttribute("aria-activedescendant"),
  options: [...document.querySelectorAll("#acq-search-results [role='option']")].map(option => option.id),
}));
if (comboState.activeDescendant !== comboState.options[0]) {
  errors.push(`combobox ArrowDown: ${comboState.activeDescendant}/${comboState.options[0]}`);
}
await page.keyboard.press("End");
comboState = await page.evaluate(() => ({
  activeDescendant: document.querySelector("#acq-search").getAttribute("aria-activedescendant"),
  options: [...document.querySelectorAll("#acq-search-results [role='option']")].map(option => option.id),
}));
if (comboState.activeDescendant !== comboState.options.at(-1)) {
  errors.push(`combobox End: ${comboState.activeDescendant}/${comboState.options.at(-1)}`);
}
await page.keyboard.press("Home");
await page.keyboard.press("ArrowUp");
comboState = await page.evaluate(() => ({
  activeDescendant: document.querySelector("#acq-search").getAttribute("aria-activedescendant"),
  selectedId: document.querySelector(
    `#${CSS.escape(document.querySelector("#acq-search").getAttribute("aria-activedescendant") || "")}`
  )?.dataset.id,
}));
await page.keyboard.press("Enter");
await page.waitForFunction(id =>
  window.CPN_AcquisitionTimeline.testState().focusedId === id,
comboState.selectedId);
await page.locator("#acq-search").focus();
await page.fill("#acq-search", "Jasper");
await page.keyboard.press("Escape");
if (!(await page.locator("#acq-search-results").isHidden()) ||
    await page.locator("#acq-search").getAttribute("aria-activedescendant")) {
  errors.push("combobox Escape did not clear popup state");
}

const minimap = page.locator("#acq-minimap-track");
const minimapRole = await minimap.getAttribute("role");
const minimapLabel = await minimap.getAttribute("aria-label");
if (minimapRole !== "slider" || !minimapLabel) {
  errors.push(`minimap accessibility: ${minimapRole}/${minimapLabel}`);
}
await minimap.focus();
await page.keyboard.press("Home");
const minimapHome = await page.locator("#acq-canvas").evaluate(canvas => canvas.scrollLeft);
await page.keyboard.press("ArrowRight");
const minimapRight = await page.locator("#acq-canvas").evaluate(canvas => canvas.scrollLeft);
await page.keyboard.press("End");
const minimapEnd = await page.locator("#acq-canvas").evaluate(canvas => canvas.scrollLeft);
if (minimapHome !== 0 || minimapRight <= minimapHome ||
    minimapEnd < minimapRight) {
  errors.push(`minimap keyboard: ${minimapHome}/${minimapRight}/${minimapEnd}`);
}

const compactFilters = await page.evaluate(() => ({
  buttonExpanded: document.querySelector("#acq-filter-btn")?.getAttribute("aria-expanded"),
  menuRole: document.querySelector("#acq-filter-menu")?.getAttribute("role"),
  exposedChips: document.querySelectorAll("#acq-head .acq-filter-chip").length,
  period: document.querySelector("#acq-current-period")?.textContent.trim(),
}));
if (compactFilters.buttonExpanded !== "false") errors.push("filter button missing collapsed state");
if (compactFilters.menuRole !== "menu") errors.push(`filter menu role: ${compactFilters.menuRole}`);
if (compactFilters.exposedChips) errors.push("legacy filter chips remain exposed");
if (!compactFilters.period) errors.push("sticky temporal context was empty");

await page.click("#acq-filter-btn");
if (await page.locator("#acq-filter-menu").isHidden()) errors.push("filter menu did not open");
await page.click('#acq-filter-menu [data-acq-filter="featured"]');
const activeFilter = await page.locator("#acq-filter-btn").textContent();
if (!activeFilter.includes("Megadeals")) errors.push(`active filter label: ${activeFilter}`);

const excludedSearch = await page.evaluate(() => {
  const api = window.CPN_AcquisitionTimeline;
  return window.CPN_ACQUISITIONS.acquisitions.find(acq =>
    !acq.featured && api.searchAcquisitions(acq.company)[0]?.id === acq.id);
});
await page.fill("#acq-search", excludedSearch.company);
await page.keyboard.press("Enter");
await page.waitForTimeout(100);
const searchSelection = await page.evaluate(() => ({
  state: window.CPN_AcquisitionTimeline.testState(),
  filterLabel: document.querySelector("#acq-filter-btn")?.textContent,
  activeId: document.activeElement?.dataset?.id,
  activeVisible: Boolean(document.activeElement?.getClientRects().length),
}));
if (searchSelection.state.focusedId !== excludedSearch.id) {
  errors.push(`filtered search focus: ${searchSelection.state.focusedId}`);
}
if (!searchSelection.filterLabel.includes("All")) {
  errors.push(`filtered search retained filter: ${searchSelection.filterLabel}`);
}
if (!searchSelection.state.visibleIds.includes(excludedSearch.id)) {
  errors.push("filtered search selection was unreachable");
}
if (searchSelection.activeId !== excludedSearch.id || !searchSelection.activeVisible) {
  errors.push(`search focus restoration: ${searchSelection.activeId}`);
}

await page.click("#acq-filter-btn");
let rovingState = await page.evaluate(() => {
  const items = [...document.querySelectorAll("#acq-filter-menu [role='menuitemradio']")];
  return {
    tabStops: items.filter(item => item.tabIndex === 0).map(item => item.dataset.acqFilter),
    active: document.activeElement?.dataset?.acqFilter,
  };
});
if (rovingState.tabStops.length !== 1 || rovingState.tabStops[0] !== rovingState.active) {
  errors.push(`filter initial roving tabindex: ${rovingState.tabStops.join(",")}/${rovingState.active}`);
}
await page.keyboard.press("ArrowDown");
let menuFocus = await page.evaluate(() => document.activeElement?.dataset?.acqFilter);
if (menuFocus !== "featured") errors.push(`filter ArrowDown focus: ${menuFocus}`);
rovingState = await page.evaluate(() => {
  const items = [...document.querySelectorAll("#acq-filter-menu [role='menuitemradio']")];
  return {
    tabStops: items.filter(item => item.tabIndex === 0).map(item => item.dataset.acqFilter),
    active: document.activeElement?.dataset?.acqFilter,
  };
});
if (rovingState.tabStops.length !== 1 || rovingState.tabStops[0] !== "featured") {
  errors.push(`filter moved roving tabindex: ${rovingState.tabStops.join(",")}`);
}
await page.keyboard.press("End");
const lastFilter = await page.evaluate(() =>
  [...document.querySelectorAll("#acq-filter-menu [data-acq-filter]")].at(-1)?.dataset.acqFilter);
menuFocus = await page.evaluate(() => document.activeElement?.dataset?.acqFilter);
if (menuFocus !== lastFilter) errors.push(`filter End focus: ${menuFocus}`);
await page.keyboard.press("Home");
menuFocus = await page.evaluate(() => document.activeElement?.dataset?.acqFilter);
if (menuFocus !== "all") errors.push(`filter Home focus: ${menuFocus}`);
await page.keyboard.press("ArrowUp");
menuFocus = await page.evaluate(() => document.activeElement?.dataset?.acqFilter);
if (menuFocus !== lastFilter) errors.push(`filter ArrowUp wrap: ${menuFocus}`);
await page.keyboard.press("Escape");
if (!(await page.locator("#acq-filter-menu").isHidden())) errors.push("Escape did not close filter menu");
if (await page.evaluate(() => document.activeElement?.id) !== "acq-filter-btn") {
  errors.push("filter Escape did not restore button focus");
}

await page.click("#acq-filter-btn");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Tab");
if (!(await page.locator("#acq-filter-menu").isHidden())) errors.push("Tab did not close filter menu");
if (await page.evaluate(() => document.activeElement?.id) !== "acq-close") {
  errors.push(`filter Tab exit: ${await page.evaluate(() => document.activeElement?.id)}`);
}

await page.locator("#acq-filter-btn").focus();
await page.keyboard.press("Enter");
await page.keyboard.press("Shift+Tab");
if (!(await page.locator("#acq-filter-menu").isHidden())) errors.push("Shift+Tab did not close filter menu");
if (await page.evaluate(() => document.activeElement?.id) !== "acq-filter-btn") {
  errors.push(`filter Shift+Tab exit: ${await page.evaluate(() => document.activeElement?.id)}`);
}

await page.click("#acq-filter-btn");
await page.keyboard.press("End");
await page.keyboard.press("Enter");
const selectedFilter = await page.evaluate(() =>
  document.querySelector('#acq-filter-menu [aria-checked="true"]')?.dataset.acqFilter);
if (await page.evaluate(() => document.activeElement?.id) !== "acq-filter-btn") {
  errors.push("filter selection did not restore button focus");
}
const filteredBounds = await page.evaluate(filter => {
  const list = window.CPN_ACQUISITIONS.acquisitions
    .filter(acq => acq.era === filter)
    .sort((a, b) => a.announced.localeCompare(b.announced) || a.id.localeCompare(b.id));
  return { first: list[0]?.id, last: list.at(-1)?.id };
}, selectedFilter);
await page.click("#acq-next");
let focused = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState().focusedId);
if (focused !== filteredBounds.first) errors.push(`filtered next boundary: ${focused}`);
await page.click("#acq-prev");
focused = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState().focusedId);
if (focused !== filteredBounds.last) errors.push(`filtered previous wrap: ${focused}`);
await page.waitForFunction(id => document.activeElement?.dataset?.id === id, filteredBounds.last);
if (await page.evaluate(() => document.activeElement?.dataset?.id) !== filteredBounds.last) {
  errors.push("previous navigation did not restore card focus");
}

await page.click("#acq-filter-btn");
await page.click('#acq-filter-menu [data-acq-filter="all"]');
await page.fill("#acq-search", "Meraki");
await page.keyboard.press("Enter");
await page.locator("#acq-focus-clear").evaluate(el => el.click());
await page.evaluate(() => window.CPN_AcquisitionTimeline.setZoom(2.4));
await page.locator("#acq-canvas").evaluate(el => {
  const yearMin = 1993;
  const zoom = 2.4;
  el.scrollLeft = (2012 - yearMin) * 72 * zoom + 120 - el.clientWidth / 2;
});
await page.waitForFunction(() =>
  document.querySelector('.acq-overflow-marker[aria-label*="2012"]'));
await page.locator('.acq-overflow-marker[aria-label*="2012"]').evaluate(el => el.click());
await page.waitForFunction(() => window.CPN_AcquisitionTimeline.testState().expandedYear === 2012);
const crossYear = await page.evaluate(() => {
  const list = window.CPN_ACQUISITIONS.acquisitions
    .slice().sort((a, b) => a.announced.localeCompare(b.announced) || a.id.localeCompare(b.id));
  const currentIndex = list.map(acq => acq.announced.slice(0, 4)).lastIndexOf("2012");
  return { current: list[currentIndex].id, next: list[currentIndex + 1].id };
});
await page.locator(`.acq-card[data-id="${crossYear.current}"]`).evaluate(el => el.click());
await page.click("#acq-next");
const crossYearReached = await page.waitForFunction(id => {
  const state = window.CPN_AcquisitionTimeline.testState();
  return state.focusedId === id && state.visibleIds.includes(id) &&
    document.activeElement?.dataset?.id === id;
}, crossYear.next, { timeout: 3000 }).then(() => true, () => false);
const crossYearState = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState());
if (!crossYearReached) {
  const activeId = await page.evaluate(() => document.activeElement?.dataset?.id);
  errors.push(`cross-year reachability: ${crossYearState.focusedId}/${activeId}`);
}
if (crossYearState.expandedYear != null) {
  errors.push(`cross-year navigation retained tray: ${crossYearState.expandedYear}`);
}

await page.locator("#acq-canvas").evaluate(el => {
  const rawYear = 2012.75;
  el.scrollLeft = (rawYear - 1993) * 72 * 2.4 + 120 - el.clientWidth / 2;
  el.dispatchEvent(new Event("scroll"));
});
await page.waitForFunction(() =>
  document.querySelector("#acq-current-period")?.textContent.trim() === "2012");
const exactPeriod = await page.locator("#acq-current-period").textContent();
if (exactPeriod.trim() !== "2012") errors.push(`centered temporal year: ${exactPeriod}`);

const accessibility = await page.evaluate(() => {
  const marker = document.querySelector(".acq-year-marker, .acq-overflow-marker");
  const card = document.querySelector(".acq-card");
  return {
    markerRole: marker?.getAttribute("role"),
    markerTabIndex: marker?.tabIndex,
    markerLabel: marker?.getAttribute("aria-label"),
    cardRole: card?.getAttribute("role"),
    cardTabIndex: card?.tabIndex,
    cardLabel: card?.getAttribute("aria-label"),
  };
});
if (accessibility.markerRole && accessibility.markerRole !== "button") {
  errors.push(`marker role: ${accessibility.markerRole}`);
}
if (accessibility.markerTabIndex != null && accessibility.markerTabIndex !== 0) {
  errors.push(`marker tabindex: ${accessibility.markerTabIndex}`);
}
if (accessibility.markerRole && !accessibility.markerLabel) errors.push("marker label missing");
if (accessibility.cardRole && accessibility.cardRole !== "button") {
  errors.push(`card role: ${accessibility.cardRole}`);
}
if (accessibility.cardTabIndex != null && accessibility.cardTabIndex !== 0) {
  errors.push(`card tabindex: ${accessibility.cardTabIndex}`);
}
if (accessibility.cardRole && !accessibility.cardLabel) errors.push("card label missing");

const invalidVerifiedSources = await page.evaluate(() => {
  const allowed = new Set(["official", "wikimedia", "wikipedia", "manual"]);
  return window.CPN_ACQUISITIONS.acquisitions
    .filter(acq => acq.visualIdentity?.kind === "verified-logo" &&
      !allowed.has(acq.visualIdentity?.source))
    .map(acq => `${acq.id}:${acq.visualIdentity.source}`);
});
if (invalidVerifiedSources.length) {
  errors.push(`invalid verified-logo provenance: ${invalidVerifiedSources.join(",")}`);
}
const incompleteIdentity = await page.evaluate(() =>
  window.CPN_ACQUISITIONS.acquisitions.some(acq =>
    !acq.visualIdentity?.kind || !acq.visualIdentity?.source || !acq.visualIdentity?.path)
);
if (incompleteIdentity) errors.push("dataset identity provenance incomplete");

await page.click("#acq-close");
await page.click("#tools-acquisitions");
await page.click("#acq-close");
const closeFocus = await page.evaluate(() => ({
  id: document.activeElement?.id,
  visible: Boolean(document.activeElement?.getClientRects().length),
}));
if (closeFocus.id !== "tools-acquisitions" || !closeFocus.visible) {
  errors.push(`close focus restoration: ${closeFocus.id}`);
}

const reducedPage = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
await reducedPage.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
await reducedPage.waitForFunction(() => window.CPN_AcquisitionTimeline?.open);
await reducedPage.evaluate(() => window.CPN_AcquisitionTimeline.open());
await reducedPage.click('.acq-year-marker[data-year="2012"]');
await reducedPage.evaluate(() => {
  const canvas = document.querySelector("#acq-canvas");
  canvas.scrollTo = options => { window.__acqScrollOptions = options; };
});
await reducedPage.click('.acq-card[data-id="meraki"]');
const reduced = await reducedPage.evaluate(() => ({
  state: window.CPN_AcquisitionTimeline.testState(),
  behavior: window.__acqScrollOptions?.behavior,
  particleTransforms: [...document.querySelectorAll(".acq-particle")]
    .map(node => node.style.transform).filter(Boolean),
  layerTransforms: [...document.querySelectorAll(".acq-layer")]
    .map(node => node.style.transform).filter(Boolean),
}));
if (!reduced.state.reducedMotion) errors.push("reduced-motion state not detected");
if (reduced.behavior !== "auto") errors.push(`reduced-motion focus behavior: ${reduced.behavior}`);
if (reduced.particleTransforms.length) errors.push("reduced-motion particles transformed");
if (reduced.layerTransforms.length) errors.push("reduced-motion layers transformed");

await browser.close();
if (errors.length) {
  console.error(`FAIL test-acquisitions-timeline\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("OK test-acquisitions-timeline");
