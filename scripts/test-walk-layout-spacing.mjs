import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = resolve(__dirname, "../cisco-portfolio-navigator.html");
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.__cpnLazy?.loadDesignStudio, { timeout: 10000 });
await page.evaluate(() => window.__cpnLazy.loadDesignStudio());
await page.waitForFunction(() =>
  window.DesignStudio?.instance &&
  window.__DS_WALK_LAYOUT?.diagramToWorld &&
  window.__DS_TEMPLATES?.ROOM_TEMPLATES &&
  window.__DS_STENCILS,
  { timeout: 60000 }
);

const result = await page.evaluate(() => {
  const studio = window.DesignStudio.instance;
  const templates = window.__DS_TEMPLATES;
  const stencils = window.__DS_STENCILS;
  const layout = window.__DS_WALK_LAYOUT;
  const out = [];

  function minDistances(nodes, kind) {
    const graphNodes = nodes.filter(n => {
      const def = stencils.getDef(n.stencilId, kind);
      return def && !def.decorative;
    });
    const mapped = layout.diagramToWorld(graphNodes, kind);
    const positions = mapped.positions || {};
    let min = Infinity;
    let pair = "";
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const a = positions[graphNodes[i].id], b = positions[graphNodes[j].id];
        if (!a || !b) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < min) {
          min = d;
          pair = `${graphNodes[i].label} ↔ ${graphNodes[j].label}`;
        }
      }
    }
    return { min: Number.isFinite(min) ? min : 99, pair, count: graphNodes.length };
  }

  Object.keys(templates.ROOM_TEMPLATES).forEach(key => {
    studio.design = { account: "test", rooms: [], nodes: [], links: [], bomOverrides: [], snapshots: [] };
    studio.activeRoomId = null;
    studio.addRoomTemplate(key);
    const room = studio.design.rooms[0];
    const nodes = studio.design.nodes.filter(n => n.roomId === room.id);
    out.push({ kind: "room", key, ...minDistances(nodes, "room") });
  });

  Object.keys(templates.NETWORK_TEMPLATES).forEach(key => {
    const design = { account: "test", rooms: [], nodes: [], links: [], bomOverrides: [], snapshots: [] };
    templates.applyNetworkTemplate(design, key, 80, 80, stencils);
    out.push({ kind: "network", key, ...minDistances(design.nodes, "network") });
  });
  return out;
});

const MIN_ROOM_POD_DISTANCE = 3.8;
const MIN_NETWORK_POD_DISTANCE = 3.0;
for (const r of result) {
  const min = r.kind === "room" ? MIN_ROOM_POD_DISTANCE : MIN_NETWORK_POD_DISTANCE;
  if (r.count > 1 && r.min < min) {
    errors.push(`${r.kind} ${r.key}: min ${r.min.toFixed(2)} < ${min} (${r.pair})`);
  }
}

await browser.close();

if (errors.length) {
  console.error("FAIL test-walk-layout-spacing");
  errors.forEach(e => console.error("  -", e));
  process.exit(1);
}

console.log(`OK test-walk-layout-spacing (${result.length} templates)`);
