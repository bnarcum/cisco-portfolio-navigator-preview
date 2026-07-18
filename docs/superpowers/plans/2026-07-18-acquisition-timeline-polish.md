# Acquisition Timeline Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered all-card opening state with a progressive-disclosure acquisition timeline and prevent unverified favicons from appearing as company logos.

**Architecture:** Keep the existing standalone acquisition data, CSS, and renderer assets, but separate data trust classification from visual rendering. The renderer will expose three semantic levels—overview, explore, and focus—using deterministic year groups, viewport virtualization, and a shared navigation state. Playwright verifies layout, reachability, navigation, accessibility, and reduced motion against the real HTML application.

**Tech Stack:** Vanilla JavaScript, CSS, generated JSON/JavaScript assets, Node.js build scripts, Playwright, GitHub Pages legacy deployment.

## Global Constraints

- Every acquisition must remain represented in overview counts and reachable in Explore view.
- Only official, Wikimedia/Wikipedia, or manually reviewed assets may be labeled `verified`.
- Guessed first-word-domain favicons must render as generated company-name tiles.
- Preserve Cisco as the preferred source for announced date and summary; preserve Wikipedia value and country when Cisco omits them.
- Honor `prefers-reduced-motion`.
- Keep legacy GitHub Pages deployment; do not add a Pages workflow.

---

### Task 1: Acquisition identity trust and dataset validation

**Files:**
- Modify: `scripts/build-acquisitions.mjs`
- Modify: `scripts/fetch-acq-logos.mjs`
- Modify: `assets/acq-logos/manifest.json` (generated)
- Modify: `assets/cpn-acquisitions.json` (generated)
- Modify: `assets/cpn-acquisitions-data.js` (generated)
- Create: `scripts/test-acquisitions-data.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `acquisition.visualIdentity: { kind: "verified-logo" | "name-tile", path: string, source: string, sourceUrl: string | null }`
- Produces: `validateAcquisitions(payload, manifest): string[]`
- Consumes: Wikipedia and Cisco source records already parsed by `build-acquisitions.mjs`

- [ ] **Step 1: Write the failing data validation test**

Create `scripts/test-acquisitions-data.mjs`:

```javascript
#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = JSON.parse(fs.readFileSync(path.join(root, "assets/cpn-acquisitions.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/acq-logos/manifest.json"), "utf8"));
const errors = [];
const normalized = new Set();

for (const acq of data.acquisitions) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acq.announced)) errors.push(`${acq.id}: invalid date`);
  if (normalized.has(acq.id)) errors.push(`${acq.id}: duplicate normalized id`);
  normalized.add(acq.id);
  if (!acq.visualIdentity) errors.push(`${acq.id}: missing visualIdentity`);
  if (acq.visualIdentity?.kind === "verified-logo" && !acq.visualIdentity.sourceUrl) {
    errors.push(`${acq.id}: verified logo missing source URL`);
  }
  if (manifest.items[acq.id]?.source === "favicon-png" &&
      acq.visualIdentity?.kind === "verified-logo") {
    errors.push(`${acq.id}: guessed favicon marked verified`);
  }
}

if (errors.length) {
  console.error(`FAIL test-acquisitions-data\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`OK test-acquisitions-data (${data.acquisitions.length} acquisitions)`);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node scripts/test-acquisitions-data.mjs`

Expected: FAIL with one or more `missing visualIdentity` errors.

- [ ] **Step 3: Add deterministic visual identity classification**

In `scripts/build-acquisitions.mjs`, add:

```javascript
function visualIdentityFor(id, manifest) {
  const item = manifest?.items?.[id];
  const verified = item?.verified === true &&
    ["official", "wikimedia", "wikipedia", "manual"].includes(item.source);
  return verified
    ? {
        kind: "verified-logo",
        path: item.path,
        source: item.source,
        sourceUrl: item.sourceUrl,
      }
    : {
        kind: "name-tile",
        path: `assets/acq-logos/${id}.svg`,
        source: "generated",
        sourceUrl: null,
      };
}
```

Load the existing manifest if present and assign `visualIdentity` after records are merged:

```javascript
const manifestPath = path.join(root, "assets/acq-logos/manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { items: {} };

for (const acq of acquisitions) {
  acq.visualIdentity = visualIdentityFor(acq.id, manifest);
}
```

In `scripts/fetch-acq-logos.mjs`, change automated favicon results to explicitly unverified:

```javascript
return {
  id: acq.id,
  source: "favicon-png",
  sourceUrl: `https://${domain}`,
  path: `assets/acq-logos/${acq.id}.png`,
  verified: false,
  ok: true,
};
```

Record Wikipedia results with their source URL and `verified: true`; record generated tiles with `verified: false`.

- [ ] **Step 4: Add deterministic duplicate and field validation to the build**

Export or define:

```javascript
function validateAcquisitions(payload, manifest) {
  const errors = [];
  const ids = new Set();
  for (const acq of payload.acquisitions) {
    if (ids.has(acq.id)) errors.push(`duplicate id: ${acq.id}`);
    ids.add(acq.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acq.announced)) {
      errors.push(`invalid date: ${acq.id}`);
    }
    if (!manifest.items?.[acq.id]) errors.push(`missing manifest: ${acq.id}`);
  }
  return errors;
}
```

Abort generation with a concise error when validation fails.

- [ ] **Step 5: Regenerate data without re-downloading guessed logos**

Run: `node scripts/build-acquisitions.mjs`

Expected: output reports the merged count and writes both generated data files with `visualIdentity` on every record.

- [ ] **Step 6: Run the data test**

Run: `node scripts/test-acquisitions-data.mjs`

Expected: `OK test-acquisitions-data (<count> acquisitions)`.

- [ ] **Step 7: Register the test and commit**

Add to `package.json`:

```json
"test:acquisitions-data": "node scripts/test-acquisitions-data.mjs"
```

Include `npm run test:acquisitions-data` in the main `test` script.

Run:

```bash
git add scripts/build-acquisitions.mjs scripts/fetch-acq-logos.mjs \
  scripts/test-acquisitions-data.mjs assets/acq-logos/manifest.json \
  assets/cpn-acquisitions.json assets/cpn-acquisitions-data.js package.json
git commit -m "Validate acquisition data and logo provenance"
```

---

### Task 2: Semantic zoom renderer and collision-free layout

**Files:**
- Modify: `assets/cpn-acquisitions-timeline.js`
- Modify: `assets/cpn-acquisitions-timeline.css`
- Create: `scripts/test-acquisitions-timeline.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `acquisition.visualIdentity` from Task 1
- Produces: `getSemanticLevel(zoom): "overview" | "explore" | "focus"`
- Produces: `layoutOverviewByYear(list, metrics): OverviewMarker[]`
- Produces: `layoutExploreCards(list, metrics): CardPlacement[]`
- Produces: `window.CPN_AcquisitionTimeline.testState(): TimelineTestState`

- [ ] **Step 1: Write the failing Playwright layout test**

Create `scripts/test-acquisitions-timeline.mjs` with:

```javascript
#!/usr/bin/env node
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.CPN_AcquisitionTimeline?.open);
await page.evaluate(() => window.CPN_AcquisitionTimeline.open());
await page.waitForSelector("#acq-wrap.show");

const initial = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState());
if (initial.level !== "overview") errors.push(`initial level: ${initial.level}`);
if (initial.representedCount !== initial.totalCount) {
  errors.push(`represented ${initial.representedCount}/${initial.totalCount}`);
}
if (initial.overlapCount !== 0) errors.push(`overview overlaps: ${initial.overlapCount}`);
if (initial.renderedCards >= initial.totalCount) errors.push("overview rendered every card");

await page.click('.acq-year-marker[data-year="2012"]');
await page.waitForFunction(() => window.CPN_AcquisitionTimeline.testState().level === "explore");
const explore = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState());
if (!explore.visibleIds.includes("meraki")) errors.push("2012 explore missing Meraki");
if (explore.overlapCount !== 0) errors.push(`explore overlaps: ${explore.overlapCount}`);

await browser.close();
if (errors.length) {
  console.error(`FAIL test-acquisitions-timeline\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("OK test-acquisitions-timeline");
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node scripts/test-acquisitions-timeline.mjs`

Expected: FAIL because `testState` and `.acq-year-marker` do not exist.

- [ ] **Step 3: Replace binary cluster mode with semantic levels**

In `assets/cpn-acquisitions-timeline.js`:

```javascript
function getSemanticLevel(zoom = ACQ.zoom) {
  if (ACQ.focusedId) return "focus";
  return zoom < 0.78 ? "overview" : "explore";
}
```

Change `fitAcqZoom()` to set `ACQ.zoom = ACQ.minZoom`, store `ACQ.level = "overview"`, and preserve `ACQ.anchorYear`.

- [ ] **Step 4: Implement overview year markers**

Add:

```javascript
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
```

Render each placement as a keyboard-accessible `.acq-year-marker[data-year]` with count, year, and up to one verified featured logo. Clicking or pressing Enter sets `ACQ.anchorYear`, sets zoom to `1.05`, and rerenders Explore centered on that year.

- [ ] **Step 5: Implement deterministic explore lanes**

Add:

```javascript
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
```

Render overflow items as one expandable `+N` marker per year. Mount only placements intersecting `scrollLeft ± one viewport width`; rerender on scroll with `requestAnimationFrame`.

- [ ] **Step 6: Remove global card animation and add reduced-motion behavior**

Delete the per-frame `.acq-card` bob assignment. Keep scroll-linked transforms only on `.acq-layer`.

Add to CSS:

```css
@media (prefers-reduced-motion: reduce) {
  #acq-wrap *,
  #acq-wrap *::before,
  #acq-wrap *::after {
    animation: none !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  #acq-wrap .acq-layer {
    transform: none !important;
  }
}
```

- [ ] **Step 7: Expose deterministic test state**

Add:

```javascript
function testState() {
  const nodes = [...document.querySelectorAll(".acq-year-marker, .acq-card")];
  const rects = nodes.map(node => node.getBoundingClientRect());
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
    visibleIds: [...document.querySelectorAll(".acq-card")].map(el => el.dataset.id),
    overlapCount,
  };
}
```

Expose it on `window.CPN_AcquisitionTimeline`.

- [ ] **Step 8: Run tests and commit**

Run:

```bash
node scripts/test-acquisitions-timeline.mjs
node scripts/test-acquisitions-data.mjs
```

Expected: both print `OK`.

Register `test:acquisitions-timeline` in `package.json` and the main test chain, then:

```bash
git add assets/cpn-acquisitions-timeline.js assets/cpn-acquisitions-timeline.css \
  scripts/test-acquisitions-timeline.mjs package.json
git commit -m "Add progressive disclosure to acquisition timeline"
```

---

### Task 3: Search, compact filters, and chronological navigation

**Files:**
- Modify: `assets/cpn-acquisitions-timeline.js`
- Modify: `assets/cpn-acquisitions-timeline.css`
- Modify: `scripts/test-acquisitions-timeline.mjs`

**Interfaces:**
- Consumes: semantic level and placements from Task 2
- Produces: `searchAcquisitions(query): Acquisition[]`
- Produces: `focusRelative(delta: -1 | 1): void`
- Produces: compact `#acq-filter-menu`

- [ ] **Step 1: Extend the failing Playwright test**

Append before browser close:

```javascript
await page.fill("#acq-search", "Meraki");
await page.waitForFunction(() =>
  window.CPN_AcquisitionTimeline.testState().visibleIds.includes("meraki")
);
await page.keyboard.press("Enter");
let focused = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState().focusedId);
if (focused !== "meraki") errors.push(`search focus: ${focused}`);

await page.click("#acq-next");
focused = await page.evaluate(() => window.CPN_AcquisitionTimeline.testState().focusedId);
if (!focused || focused === "meraki") errors.push("next acquisition did not advance");

const badVerified = await page.evaluate(() =>
  [...document.querySelectorAll('.acq-card[data-identity="verified-logo"]')]
    .some(el => el.dataset.identitySource === "favicon-png")
);
if (badVerified) errors.push("unverified favicon rendered as verified logo");
```

- [ ] **Step 2: Run and verify failure**

Run: `node scripts/test-acquisitions-timeline.mjs`

Expected: FAIL because `#acq-search` and `#acq-next` do not exist.

- [ ] **Step 3: Add search and focus navigation**

Implement:

```javascript
function searchAcquisitions(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return window.CPN_ACQUISITIONS.acquisitions.filter(acq =>
    [acq.company, acq.business, acq.summary, acq.announced.slice(0, 4)]
      .some(value => String(value || "").toLowerCase().includes(q))
  );
}

function focusRelative(delta) {
  const list = filteredList();
  const index = Math.max(0, list.findIndex(acq => acq.id === ACQ.focusedId));
  const next = list[(index + delta + list.length) % list.length];
  if (next) focusAcquisition(next.id);
}
```

Add a labeled search input, results popup, and Previous/Next buttons. Enter focuses the first result; Escape clears results before closing the view.

- [ ] **Step 4: Move era filters into a compact menu**

Replace the seven exposed chips with one `Filters` button and menu:

```html
<button type="button" class="rc-btn" id="acq-filter-btn"
  aria-haspopup="true" aria-expanded="false">Filters</button>
<div id="acq-filter-menu" role="menu" hidden></div>
```

Populate All, Megadeals, and each era as menu buttons. Update the button text to show the active filter.

- [ ] **Step 5: Add sticky temporal context and identity source**

Add `#acq-current-period` to the header. On scroll, calculate the viewport center year and display either that year in Explore or the era label in Overview.

Render cards with:

```javascript
card.dataset.identity = a.visualIdentity.kind;
card.dataset.identitySource = a.visualIdentity.source;
```

Use `a.visualIdentity.path` directly. Show the source and source link in the focus panel only when `sourceUrl` exists.

- [ ] **Step 6: Add keyboard and ARIA behavior**

Ensure year markers and cards have `role="button"`, `tabIndex = 0`, and complete labels. Keep focus on the selected marker/card after semantic zoom rerenders. Add ArrowLeft/ArrowRight focus navigation while the acquisition view is open.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
node scripts/test-acquisitions-timeline.mjs
node scripts/test-shortcuts-modal.mjs
```

Expected: both print `OK`.

Commit:

```bash
git add assets/cpn-acquisitions-timeline.js assets/cpn-acquisitions-timeline.css \
  scripts/test-acquisitions-timeline.mjs
git commit -m "Polish acquisition timeline navigation"
```

---

### Task 4: Responsive, theme, and reduced-motion verification

**Files:**
- Modify: `scripts/test-acquisitions-timeline.mjs`
- Modify: `assets/cpn-acquisitions-timeline.css`
- Modify: `assets/cpn-light.css`

**Interfaces:**
- Consumes: timeline DOM and `testState()` from Tasks 2–3
- Produces: automated layout coverage at desktop, tablet, mobile, light theme, and reduced motion

- [ ] **Step 1: Add responsive test cases**

Refactor the Playwright test to run:

```javascript
const cases = [
  { name: "desktop-dark", width: 1440, height: 900, theme: "dark", reducedMotion: "no-preference" },
  { name: "tablet-light", width: 1024, height: 768, theme: "light", reducedMotion: "no-preference" },
  { name: "mobile-reduced", width: 390, height: 844, theme: "dark", reducedMotion: "reduce" },
];
```

For each case, create a new page, set viewport and reduced motion, open the timeline, and assert:

```javascript
if (state.overlapCount !== 0) errors.push(`${testCase.name}: ${state.overlapCount} overlaps`);
if (state.representedCount !== state.totalCount) errors.push(`${testCase.name}: incomplete overview`);
const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
if (horizontalOverflow) errors.push(`${testCase.name}: page-level horizontal overflow`);
```

- [ ] **Step 2: Run and verify any responsive failures**

Run: `node scripts/test-acquisitions-timeline.mjs`

Expected: FAIL only for concrete responsive or overlap defects revealed by the new cases.

- [ ] **Step 3: Fix responsive header and focus layout**

At widths below 768px:

```css
@media (max-width: 768px) {
  #acq-head {
    align-items: flex-start;
    flex-direction: column;
    padding: 10px 14px;
  }
  #acq-head-controls {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  #acq-search {
    min-width: 0;
    width: 100%;
  }
  #acq-focus.show {
    max-height: 190px;
  }
}
```

Use light-theme variables rather than separate hard-coded card colors where possible. Keep focus contrast at WCAG AA for text and controls.

- [ ] **Step 4: Run the timeline and existing UI tests**

Run:

```bash
node scripts/test-acquisitions-timeline.mjs
node scripts/test-acquisitions-data.mjs
node scripts/test-shortcuts-modal.mjs
```

Expected: all print `OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-acquisitions-timeline.mjs \
  assets/cpn-acquisitions-timeline.css assets/cpn-light.css
git commit -m "Verify acquisition timeline across responsive modes"
```

---

### Task 5: Version, full verification, and deployment

**Files:**
- Modify: `cisco-portfolio-navigator.html`
- Modify: `package.json` only if test-chain registration was not completed earlier

**Interfaces:**
- Consumes: completed timeline and tests
- Produces: live production and preview serving the new `APP_VERSION`

- [ ] **Step 1: Bump the application version**

Change:

```javascript
window.__CPN_BUILD = "3.3.1";
```

Update acquisition CSS/JS/data cache-busting query strings to `v=3.3.1`.

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm run test:acquisitions-data
npm run test:acquisitions-timeline
```

Expected: both pass.

- [ ] **Step 3: Run full verification**

Run: `npm test`

Expected: every repository test exits 0.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat main...HEAD
```

Expected: no whitespace errors; only acquisition timeline, generated data, tests, version, and plan/spec files are changed.

- [ ] **Step 5: Commit the version bump**

```bash
git add cisco-portfolio-navigator.html package.json
git commit -m "Release polished acquisition timeline"
```

- [ ] **Step 6: Push and verify GitHub Pages**

From `dev`, run:

```bash
npm run deploy
```

Expected:

```text
production: v3.3.1 OK
preview: v3.3.1 OK
All targets verified live.
```

Do not report deployment complete until both live HTML pages serve `window.__CPN_BUILD="3.3.1"`.
