#!/usr/bin/env node
/** All view: semantic zoom bands + layer toggles. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");

async function stats(page) {
  return page.evaluate(() => {
    const svg = document.getElementById("gs");
    const t = d3.zoomTransform(svg);
    const nodes = [...document.querySelectorAll("g.nd")];
    const visibleNodes = nodes.filter((g) => g.style.display !== "none");
    const productNodes = visibleNodes.filter((g) => {
      const r = g.querySelector("circle.mc");
      const rad = r ? parseFloat(r.getAttribute("r") || "0") : 0;
      return rad > 0 && rad < 20;
    });
    const familyNodes = visibleNodes.length - productNodes.length;
    const productLabels = visibleNodes.map((g) => g.querySelector("text.nl")).filter((el) => {
      if (!el) return false;
      const op = parseFloat(el.style.opacity || "0");
      return op > 0.1 && (el.textContent || "").length > 0;
    });
    const links = [...document.querySelectorAll("line.lk")];
    const visibleLinks = links.filter((l) => l.style.display !== "none");
    const layersEl = document.getElementById("all-products-layers");
    return {
      viewMode: window.getViewMode?.(),
      zoomK: t.k,
      zoomBand: window.getAllProductsZoomBand?.(),
      layers: window.getAllProductsLayers?.(),
      layersVisible: layersEl ? !layersEl.hidden : false,
      layerButtons: layersEl ? layersEl.querySelectorAll("button[data-layer]").length : 0,
      visibleNodeCount: visibleNodes.length,
      familyNodeCount: familyNodes,
      productNodeCount: productNodes.length,
      visibleProductLabels: productLabels.filter((el) => {
        const g = el.closest("g.nd");
        const r = g?.querySelector("circle.mc");
        const rad = r ? parseFloat(r.getAttribute("r") || "0") : 99;
        return rad < 20;
      }).length,
      visibleLinkCount: visibleLinks.length,
    };
  });
}

async function setZoom(page, k) {
  await page.evaluate((scale) => window.__cpnTestZoomK(scale), k);
  await page.waitForTimeout(120);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`file://${html}`);
await page.waitForFunction(() => window.getViewMode && document.querySelector("#vm-seg"));
await page.click('#vm-seg [data-vm="all-products"]');
await page.waitForTimeout(900);
await setZoom(page, 0.55);

const far = await stats(page);
if (far.viewMode !== "all-products") throw new Error(`expected all-products, got ${far.viewMode}`);
if (!far.layersVisible) throw new Error("layer bar should be visible in All view");
if (far.layerButtons !== 5) throw new Error(`expected 5 layer buttons, got ${far.layerButtons}`);
if (far.layers.succession !== false) throw new Error("succession layer should default off");
if (far.productNodeCount > 5) throw new Error(`far zoom should hide products, saw ${far.productNodeCount}`);

await setZoom(page, 1.0);
const mid = await stats(page);
if (mid.zoomBand !== "mid") throw new Error(`expected mid band at k=1.0, got ${mid.zoomBand}`);
if (mid.productNodeCount < 20) throw new Error(`mid zoom should show products, saw ${mid.productNodeCount}`);
if (mid.visibleProductLabels > 3) throw new Error(`mid zoom should hide most product labels, saw ${mid.visibleProductLabels}`);

await setZoom(page, 2.0);
const close = await stats(page);
if (close.zoomBand !== "close") throw new Error(`expected close band at k=2.0, got ${close.zoomBand}`);
if (close.visibleProductLabels < 15) throw new Error(`close zoom should show product labels, saw ${close.visibleProductLabels}`);

await page.click('#all-products-layers button[data-layer="succession"]');
await page.waitForTimeout(80);
const withSucc = await stats(page);
if (!withSucc.layers.succession) throw new Error("succession layer toggle failed");

await page.click('#all-products-layers button[data-layer="products"]');
await page.waitForTimeout(80);
const noProducts = await stats(page);
if (noProducts.productNodeCount > 0) throw new Error("products layer off should hide product nodes");

console.log("test-all-products-view: ok");
console.log(JSON.stringify({ far, mid, close, withSucc, noProducts }, null, 2));
await browser.close();
