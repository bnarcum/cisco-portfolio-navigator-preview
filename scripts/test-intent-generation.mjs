// Verifies the Design Studio intent engine bases the generated design on the
// brief: distinct strong briefs produce distinct topologies, plain-language
// briefs still produce a non-empty input-appropriate network, and the
// room-mix editor override is honored.
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = resolve(__dirname, "../cisco-portfolio-navigator.html");
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });
await page.waitForFunction(() => window.__cpnLazy?.loadDesignStudio, { timeout: 10000 });
await page.evaluate(() => window.__cpnLazy.loadDesignStudio());
await page.evaluate(() => window.DesignStudio.open());
await page.waitForSelector("#ds-intent-text", { timeout: 10000 });

async function gen(brief, customMix) {
  return page.evaluate(({ b, mix }) => {
    const s = window.DesignStudio.instance;
    s.customRoomMix = mix || null;
    document.getElementById("ds-intent-text").value = b;
    s.runGenerate();
    const d = s.design;
    const net = d.nodes.filter(n => n.canvas !== "room");
    return {
      netKey: d.intentPlan?.netKey || null,
      netStencils: [...new Set(net.map(n => n.stencilId))].sort().join("|"),
      netNodes: net.length,
      rooms: (d.intentPlan?.roomPlan || []).map(r => `${r.key}x${r.count}`).join(","),
    };
  }, { b: brief, mix: customMix });
}

// 1. Distinct strong briefs → distinct topologies (the design follows input).
const strong = [
  "SNRA campus + 12 conference rooms and 6 huddles",
  "AI-ready DC spine-leaf with GPU compute and Nexus fabric",
  "Retail chain with 40 stores on Meraki",
  "SD-WAN with 8 branches and a headquarters",
  "Hospital healthcare campus with clinical wireless",
  "Manufacturing plant OT network",
  "University higher-ed campus SD-Access fabric",
];
const strongRes = [];
for (const b of strong) strongRes.push(await gen(b));
const distinctKeys = new Set(strongRes.map(r => r.netKey)).size;
if (distinctKeys < strong.length) errors.push(`strong briefs not distinct: ${distinctKeys}/${strong.length} unique netKeys`);
strongRes.forEach((r, i) => { if (r.netNodes === 0) errors.push(`strong brief produced empty network: "${strong[i]}"`); });

// 2. Plain-language briefs that used to yield an empty canvas now build a network.
const vague = {
  "small business": "campusCollapsed",
  "headquarters with wifi": "campus3tierRedundant",
  "modern workplace": "snraCampus",
  "secure network": "zeroTrustEdge",
};
for (const [b, expectKey] of Object.entries(vague)) {
  const r = await gen(b);
  if (r.netNodes === 0) errors.push(`vague brief still empty: "${b}"`);
  if (r.netKey !== expectKey) errors.push(`vague brief "${b}" → ${r.netKey}, expected ${expectKey}`);
}

// 3. Branch office must still route to branch (no regression from broadening).
const branch = await gen("branch office");
if (branch.netKey !== "branchStandard") errors.push(`"branch office" → ${branch.netKey}, expected branchStandard`);

// 4. Room-mix editor override is honored verbatim.
const mix = await gen("12 conference rooms and 6 huddles", [
  { key: "conference", count: 2 }, { key: "huddle", count: 20 },
]);
if (mix.rooms !== "conferencex2,huddlex20") errors.push(`room-mix override ignored: got ${mix.rooms}`);

// 5. Workspace Designer briefs map to new archetypes
const aud = await gen("1 auditorium for town hall events");
if (aud.rooms !== "auditoriumx1") errors.push(`auditorium brief → ${aud.rooms}, expected auditoriumx1`);
const desks = await gen("1 open desk for hot-desking floor");
if (!desks.rooms.includes("openDesk")) errors.push(`open desk brief → ${desks.rooms}`);

await browser.close();

if (errors.length) { console.error("FAIL test-intent-generation\n" + errors.join("\n")); process.exit(1); }
console.log(`OK test-intent-generation\n  strong distinct: ${distinctKeys}/${strong.length} · vague non-empty · branch ok · room-mix override ok`);
