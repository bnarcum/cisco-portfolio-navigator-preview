#!/usr/bin/env node
/** Composition drill-in: orbit centered, products visible, no stale label pills. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const FAMILY = "room-systems";

function diag(page) {
  return page.evaluate((familyId) => {
    const svg = document.getElementById("gs");
    const t = d3.zoomTransform(svg);
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    const panel = document.getElementById("panel");
    const pw = panel?.classList.contains("open") ? 390 : 0;
    const cx = (w - pw) / 2;
    const cy = h / 2;

    const familyNode = [...document.querySelectorAll("g.nd")].find((g) => {
      const label = g.querySelector("text.nl")?.textContent || "";
      return /room systems/i.test(label);
    });

    let familyCenterError = Infinity;
    let familyGraph = null;
    if (familyNode) {
      const tr = familyNode.getAttribute("transform") || "";
      const m = tr.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (m) familyGraph = { x: +m[1], y: +m[2] };
      const bb = familyNode.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const sx = bb.x + bb.width / 2 - svgRect.x;
      const sy = bb.y + bb.height / 2 - svgRect.y;
      familyCenterError = Math.hypot(sx - cx, sy - cy);
    }

    const nodes = [...document.querySelectorAll("g.nd")];
    const visibleNodes = nodes.filter((g) => g.style.display !== "none");
    const productNodes = visibleNodes.filter((g) => {
      const t2 = g.querySelector("text.nl")?.textContent || "";
      return t2 && !/room systems/i.test(t2);
    });
    const visiblePills = [...document.querySelectorAll("rect.nl-bg")].filter((r) => {
      const op = parseFloat(r.style.opacity ?? r.getAttribute("opacity") ?? "1");
      const w2 = parseFloat(r.getAttribute("width") || "0");
      return op > 0.05 && w2 > 2;
    });

    const orbit = document.querySelector("g.comp-orbit circle");
    const orbitR = orbit ? parseFloat(orbit.getAttribute("r") || "0") : 0;

    const productImgs = productNodes.map((g) => g.querySelector("image.pimg"));
    const withPhoto = productImgs.filter((img) => img && img.getAttribute("href")).length;
    const withMatrixPhoto = productImgs.filter((img) => {
      const href = img?.getAttribute("href") || "";
      return href.includes("collaboration-device-matrix") || href.includes("img-");
    }).length;

    return {
      viewMode: window.getViewMode?.(),
      viewFocus: window.getViewFocus?.(),
      transform: { x: t.x, y: t.y, k: t.k },
      viewport: { w, h, pw, cx, cy },
      familyGraph,
      familyCenterError: Math.round(familyCenterError),
      visibleNodeCount: visibleNodes.length,
      productNodeCount: productNodes.length,
      orbitR,
      visiblePillCount: visiblePills.length,
      withPhoto,
      withMatrixPhoto,
      hint: document.getElementById("hint")?.textContent?.slice(0, 80) || "",
    };
  }, FAMILY);
}

function assertComposition(result, label) {
  const errors = [];
  if (result.viewMode !== "composition") errors.push(`viewMode=${result.viewMode}`);
  if (result.viewFocus !== FAMILY) errors.push(`viewFocus=${result.viewFocus}`);
  if (result.productNodeCount < 8) errors.push(`only ${result.productNodeCount} product nodes visible`);
  if (result.visibleNodeCount < 9) errors.push(`only ${result.visibleNodeCount} nodes visible`);
  if (result.orbitR < 80) errors.push(`orbitR=${result.orbitR}`);
  if (result.familyCenterError > 120) errors.push(`family off-center by ${result.familyCenterError}px`);
  if (result.visiblePillCount > 0) errors.push(`${result.visiblePillCount} stale nl-bg pills`);
  if (result.withPhoto < 8) errors.push(`only ${result.withPhoto} product nodes have pimg href`);
  if (result.withMatrixPhoto < 8) errors.push(`only ${result.withMatrixPhoto} matrix product photos`);
  if (errors.length) {
    console.error(`FAIL [${label}]:`, errors.join("; "));
    console.error(JSON.stringify(result, null, 2));
    return false;
  }
  console.log(`PASS [${label}]`, {
    familyCenterError: result.familyCenterError,
    productNodeCount: result.productNodeCount,
    withPhoto: result.withPhoto,
    orbitR: result.orbitR,
    k: result.transform.k.toFixed(3),
  });
  return true;
}

const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof window.applyViewLevel === "function", { timeout: 60000 });
  await page.evaluate(() => {
    localStorage.removeItem("cpn-view-mode-v2");
    localStorage.removeItem("cpn-view-focus-v2");
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof window.applyViewLevel === "function", { timeout: 60000 });
  await page.evaluate(() => document.querySelector('[data-vm="families"]')?.click());
  await page.waitForTimeout(600);

  // Scenario A: API drill-in from all-pillars families view
  await page.evaluate((id) => window.applyViewLevel("composition", { focusFamily: id }), FAMILY);
  await page.waitForTimeout(400);
  if (!assertComposition(await diag(page), "api-all-pillars")) failed = true;

  // Reset to families + workplaces pillar focus (zoomed single pillar)
  await page.evaluate(() => {
    window.applyViewLevel("families");
    document.querySelector("#pillar-legend .pl-item[data-pillar='workplaces']")?.click();
  });
  await page.waitForTimeout(700);

  // Scenario B: API drill-in from single-pillar zoom
  await page.evaluate((id) => window.applyViewLevel("composition", { focusFamily: id }), FAMILY);
  await page.waitForTimeout(400);
  if (!assertComposition(await diag(page), "api-workplaces-pillar")) failed = true;

  // Scenario C: double-click family node in workplaces pillar
  await page.evaluate(() => {
    window.applyViewLevel("families");
    document.querySelector("#pillar-legend .pl-item[data-pillar='workplaces']")?.click();
  });
  await page.waitForTimeout(700);

  const dbl = await page.evaluate((familyId) => {
    const node = NODES.find((n) => n.id === familyId);
    if (!node) return { ok: false, reason: "node missing" };
    const svg = document.getElementById("gs");
    const t = d3.zoomTransform(svg);
    const [sx, sy] = t.apply([node.x, node.y]);
    const el = document.elementFromPoint(sx + svg.getBoundingClientRect().x, sy + svg.getBoundingClientRect().y);
    const g = el?.closest?.("g.nd");
    if (!g) return { ok: false, reason: "no g.nd at screen point", sx, sy, nx: node.x, ny: node.y };
    g.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
    return { ok: true, sx, sy };
  }, FAMILY);
  if (!dbl.ok) {
    console.error("FAIL [dblclick-setup]:", dbl);
    failed = true;
  } else {
    await page.waitForTimeout(500);
    if (!assertComposition(await diag(page), "dblclick-workplaces")) failed = true;
  }

  // Scenario D: All Products → composition (reused product nodes must gain photos)
  await page.evaluate(() => {
    window.applyViewLevel("all-products");
    document.querySelectorAll(".cp").forEach((b) => {
      b.classList.toggle("off", b.dataset.cat !== "collaboration");
    });
    window.applyFilters?.();
  });
  await page.waitForTimeout(500);
  await page.evaluate((id) => window.applyViewLevel("composition", { focusFamily: id }), FAMILY);
  await page.waitForTimeout(400);
  if (!assertComposition(await diag(page), "all-products-drill-in")) failed = true;

  process.exit(failed ? 1 : 0);
} finally {
  await browser.close();
}
