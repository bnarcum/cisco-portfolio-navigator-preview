import { chromium } from "playwright";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 9876 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}/cisco-portfolio-navigator.html`;

const server = spawn("python3", ["-m", "http.server", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  server.on("error", reject);
  setTimeout(resolve, 400);
});

const WEBGL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

let exitCode = 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.click('#vm-seg button[data-vm="spatial"]');
  await page.waitForTimeout(4000);

  const debug = await page.evaluate(() => ({
    viewMode: window.getViewMode?.(),
    active: document.getElementById("spatial-wrap")?.style.display,
    spriteText: typeof window.SpriteText === "function",
  }));
  console.log("Debug:", debug);

  const toast = await page.locator("#toast.show").textContent().catch(() => "");
  const spatialVisible = await page.locator("#spatial-wrap").evaluate(el => el.style.display !== "none");
  const hasCanvas = await page.locator("#spatial-graph canvas").count();
  const forceGraph = await page.evaluate(() => typeof window.ForceGraph3D === "function");

  console.log("ForceGraph3D loaded:", forceGraph);
  console.log("Spatial wrap visible:", spatialVisible);
  console.log("WebGL canvas count:", hasCanvas);
  if (toast) console.log("Toast:", toast);
  if (errors.length) console.log("Errors:", errors.slice(0, 8));

  if (toast && (toast.includes("failed") || toast.includes("could not"))) {
    console.error("FAIL: error toast shown");
    exitCode = 1;
  } else if (!spatialVisible || hasCanvas < 1) {
    console.error("FAIL: spatial view did not render");
    exitCode = 1;
  } else if (!debug.spriteText) {
    console.error("FAIL: SpriteText library not loaded");
    exitCode = 1;
  } else {
    const tiles = await page.evaluate(() => window.__cpnSpatialTileStats?.());
    console.log("Tile stats:", tiles);
    if (!tiles || tiles.groups < 1 || tiles.withTile < Math.min(3, tiles.groups)) {
      console.error("FAIL: spatial nodes missing icon tiles", tiles);
      exitCode = 1;
    } else {
      const linksAtRest = await page.evaluate(() => window.__cpnSpatialLinkStats?.());
      console.log("Links at rest:", linksAtRest);
      if (!linksAtRest || linksAtRest.lensActive !== true || linksAtRest.visible !== 0) {
        console.error("FAIL: constellation should hide all links until a family is selected", linksAtRest);
        exitCode = 1;
      } else {
      // Filter to Collaboration only — camera must stay in readable range (no zoomToFit blow-out).
      for (const cat of ["networking", "security", "computing", "observability"]) {
        await page.click(`.cp[data-cat="${cat}"]`);
      }
      await page.waitForTimeout(2500);
      const filtered = await page.evaluate(() => window.__cpnSpatialCameraStats?.());
      console.log("Filtered camera:", filtered);
      const lens = await page.evaluate(() => window.__cpnSpatialCameraStats?.());
      console.log("Lens state:", lens);
      if (!filtered || filtered.nodeCount < 3) {
        console.error("FAIL: filtered spatial graph too few nodes", filtered);
        exitCode = 1;
      } else if (filtered.dist > 420 || filtered.dist < 80) {
        console.error("FAIL: filtered spatial camera out of readable range", filtered);
        exitCode = 1;
      } else {
        console.log("PASS: Spatial view loaded; filtered camera framing OK");
      }
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(exitCode);
