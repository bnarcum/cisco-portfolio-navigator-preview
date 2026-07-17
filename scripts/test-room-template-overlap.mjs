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
await page.waitForFunction(() => window.DesignStudio?.instance && window.__DS_TEMPLATES?.ROOM_TEMPLATES, { timeout: 60000 });

const result = await page.evaluate(() => {
  const studio = window.DesignStudio.instance;
  const templates = window.__DS_TEMPLATES.ROOM_TEMPLATES;
  const out = [];
  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  Object.keys(templates).forEach(key => {
    studio.startOver = () => {}; // guard against accidental UI prompt use
    studio.design = { account: "test", rooms: [], nodes: [], links: [], bomOverrides: [], snapshots: [] };
    studio.activeRoomId = null;
    studio.addRoomTemplate(key);
    const room = studio.design.rooms[0];
    const nodes = studio.design.nodes.filter(n => n.roomId === room.id).map(n => ({
      label: n.label,
      stencilId: n.stencilId,
      x: n.x,
      y: n.y,
      w: n.w || 76,
      h: n.h || 46,
    }));
    const overlaps = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (intersects(nodes[i], nodes[j])) overlaps.push(`${nodes[i].label} overlaps ${nodes[j].label}`);
      }
    }
    out.push({ key, count: nodes.length, overlaps });
  });
  return out;
});

for (const r of result) {
  if (r.overlaps.length) errors.push(`${r.key}: ${r.overlaps.join("; ")}`);
}

await browser.close();

if (errors.length) {
  console.error("FAIL test-room-template-overlap");
  errors.forEach(e => console.error("  -", e));
  process.exit(1);
}

console.log(`OK test-room-template-overlap (${result.length} room templates)`);
