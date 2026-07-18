#!/usr/bin/env node
/**
 * Merge Wikipedia + Cisco official acquisition lists → assets/cpn-acquisitions-data.js
 * Run: node scripts/build-acquisitions.mjs
 * Then: node scripts/fetch-acq-logos.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outJs = path.join(root, "assets/cpn-acquisitions-data.js");
const outJson = path.join(root, "assets/cpn-acquisitions.json");

const WIKI_URL =
  "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_acquisitions_by_Cisco&prop=text&format=json&origin=*";
const CISCO_URL =
  "https://www.cisco.com/site/us/en/about/corporate-development/acquisitions/acquisitions-list-years/index.html";

/** Manual family links — keys match slugify(normalizeCompany(name)) */
const FAMILY_MAP = {
  meraki: ["meraki-mx", "meraki-switches", "meraki-wireless"],
  webex: ["webex-app", "webex-meetings", "webex-calling", "webex-cc"],
  webexcommunications: ["webex-app", "webex-meetings"],
  splunk: ["splunk", "appdynamics"],
  appdynamics: ["appdynamics"],
  duosecurity: ["duo"],
  opendns: ["umbrella"],
  sourcefire: ["sf-enterprise", "sf-branch"],
  thousandeyes: ["thousandeyes"],
  tandberg: ["room-systems"],
  linksys: ["meraki-mx"],
  viptela: ["sdwan"],
  acaciacommunications: ["nexus"],
  jasper: ["iot-control-center"],
  valtix: ["hypershield"],
  broadsoft: ["webex-calling"],
  ironport: ["email-security"],
  starentnetworks: ["mobile-core"],
  scientificatlanta: ["video"],
  ndsgroup: ["video"],
  intucell: ["mobile-core"],
  cloudlock: ["cloudlock"],
  tailfsystems: ["nso"],
  metacloud: ["intersight"],
  leaba: ["silicon-one"],
  sedonasystems: ["nso"],
  imimobile: ["webex-connect"],
  slido: ["webex-meetings"],
  armorblox: ["email-security"],
  isovalent: ["hypershield"],
};

const ERA_BANDS = [
  { id: "routing", label: "Routing & switching", from: 1993, to: 1999, color: "#0A60FF" },
  { id: "dotcom", label: "Dot-com expansion", from: 2000, to: 2005, color: "#6366f1" },
  { id: "collab", label: "Collaboration & video", from: 2006, to: 2012, color: "#2dce5c" },
  { id: "cloud", label: "Cloud & SaaS", from: 2013, to: 2018, color: "#FF9000" },
  { id: "security", label: "Security & observability", from: 2019, to: 2022, color: "#ef4444" },
  { id: "ai", label: "AI & resilience", from: 2023, to: 2030, color: "#02C8FF" },
];

function normalizeCompany(name) {
  return name
    .replace(/&#39;/g, "'")
    .replace(/\([^)]*\)/g, "")
    .replace(/,?\s*(Inc\.?|LLC|Ltd\.?|PLC|Corp\.?|Corporation|Limited|A\/S|A\.S\.|Group|Technologies|Technology)\.?$/gi, "")
    .replace(/['']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(name) {
  const base = normalizeCompany(name);
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "unknown";
}

function parseWikiDate(raw) {
  if (!raw) return null;
  const t = raw.replace(/\[.*?\]/g, "").replace(/<[^>]+>/g, "").trim();
  let m = t.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const months = {
      january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
      jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mon = months[m[1].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${String(m[2]).padStart(2, "0")}`;
  }
  m = t.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const months = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
    const mon = months[m[1].toLowerCase()];
    if (mon) return `${m[2]}-${mon}-01`;
  }
  m = t.match(/^(\d{4})$/);
  if (m) return `${m[1]}-06-15`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  return null;
}

function parseValue(raw) {
  if (!raw || raw === "—" || raw === "-") return null;
  const cleaned = raw.replace(/,/g, "").replace(/\$/g, "").trim();
  const m = cleaned.match(/^([\d.]+)/);
  if (!m) return null;
  return parseFloat(m[1]);
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cellText(html) {
  const sort = html.match(/data-sort-value="(\d{4}-\d{2}-\d{2})/);
  if (sort) return sort[1];
  return stripHtml(html);
}

function parseWikiTable(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let td;
    while ((td = tdRe.exec(tr[1]))) cells.push(cellText(td[1]));
    if (cells.length >= 2 && cells[0] && !/^date$/i.test(cells[0])) {
      const date = parseWikiDate(cells[0]);
      const company = cells[1]?.replace(/\s+/g, " ").trim();
      if (date && company) {
        rows.push({
          announced: date,
          company,
          business: cells[2] || "",
          country: cells[3] || "",
          valueUsd: parseValue(cells[4]),
        });
      }
    }
  }
  return rows;
}

function parseCiscoPage(html) {
  const items = [];
  const re = /<li[^>]*>\s*(?:<a[^>]*>)?([^<]+)(?:<\/a>)?\s*[-–]\s*([^<\n]+)(?:<br\s*\/?>|\n)([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html))) {
    const company = m[1].replace(/\(intent to acquire\)/i, "").replace(/\u00a0/g, " ").trim();
    const dateRaw = m[2].replace(/\u00a0/g, " ").trim();
    const summary = stripHtml(m[3]).slice(0, 1200);
    const announced = parseWikiDate(dateRaw) || parseWikiDate(dateRaw.replace(/^Subject to close\.\s*/i, ""));
    if (company && announced && !/^view by/i.test(company)) {
      items.push({ company, announced, summary });
    }
  }
  return items;
}

function eraForYear(y) {
  return ERA_BANDS.find(e => y >= e.from && y <= e.to)?.id || "ai";
}

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

export function mergeRecords(wiki, cisco) {
  const byKey = new Map();

  for (const w of wiki) {
    const id = slugify(w.company);
    byKey.set(id, {
      id,
      company: w.company,
      announced: w.announced,
      business: w.business,
      country: w.country,
      valueUsd: w.valueUsd,
      summary: "",
      families: FAMILY_MAP[id] || FAMILY_MAP[id.replace(/-/g, "")] || [],
      era: eraForYear(+w.announced.slice(0, 4)),
      featured: (w.valueUsd || 0) >= 1e9,
      sources: ["wikipedia"],
      logo: `assets/acq-logos/${id}.webp`,
      wikiTitle: w.company,
    });
  }

  for (const c of cisco) {
    const id = slugify(c.company);
    const existing = byKey.get(id);
    if (existing) {
      existing.announced = c.announced;
      existing.summary = c.summary || "";
      existing.era = eraForYear(+c.announced.slice(0, 4));
      if (!existing.sources.includes("cisco")) existing.sources.push("cisco");
    } else {
      byKey.set(id, {
        id,
        company: c.company,
        announced: c.announced,
        business: "",
        country: "",
        valueUsd: null,
        summary: c.summary || "",
        families: FAMILY_MAP[id] || FAMILY_MAP[id.replace(/-/g, "")] || [],
        era: eraForYear(+c.announced.slice(0, 4)),
        featured: false,
        sources: ["cisco"],
        logo: `assets/acq-logos/${id}.webp`,
        wikiTitle: c.company,
      });
    }
  }

  const list = [...byKey.values()].sort((a, b) => a.announced.localeCompare(b.announced));

  // Mark megadeals
  for (const r of list) {
    if ((r.valueUsd || 0) >= 3e9) r.featured = true;
    if (["splunk", "webex-communications-inc", "webex", "meraki-inc", "duo-security", "thousandeyes-inc", "appdynamics-inc", "tandberg", "sourcefire", "scientific-atlanta-inc", "nds-group-ltd", "opendns", "acacia-communications-inc"].includes(r.id)) {
      r.featured = true;
    }
  }

  return list;
}

async function main() {
  console.log("Fetching Wikipedia acquisitions list…");
  const wikiRes = await fetch(WIKI_URL, {
    headers: { "User-Agent": "CiscoPortfolioNavigator/1.0 (build script)" },
  });
  const wikiJson = await wikiRes.json();
  const wikiHtml = wikiJson.parse?.text?.["*"] || wikiJson.parse?.text || "";
  const wikiRows = parseWikiTable(wikiHtml);
  console.log(`  Wikipedia: ${wikiRows.length} rows`);

  console.log("Fetching Cisco official list…");
  const ciscoRes = await fetch(CISCO_URL, {
    headers: { "User-Agent": "CiscoPortfolioNavigator/1.0 (build script)" },
  });
  const ciscoHtml = await ciscoRes.text();
  const ciscoRows = parseCiscoPage(ciscoHtml);
  console.log(`  Cisco: ${ciscoRows.length} entries`);

  const acquisitions = mergeRecords(wikiRows, ciscoRows);
  console.log(`  Merged: ${acquisitions.length} unique acquisitions`);

  const manifestPath = path.join(root, "assets/acq-logos/manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { items: {} };

  for (const acq of acquisitions) {
    acq.visualIdentity = visualIdentityFor(acq.id, manifest);
  }

  const payload = {
    generated: new Date().toISOString(),
    sources: ["https://en.wikipedia.org/wiki/List_of_acquisitions_by_Cisco", CISCO_URL],
    eraBands: ERA_BANDS,
    acquisitions,
  };

  const errors = validateAcquisitions(payload, manifest);
  if (errors.length) {
    throw new Error(`Acquisition validation failed:\n${errors.join("\n")}`);
  }

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));

  const js = `/** Auto-generated by scripts/build-acquisitions.mjs — do not edit manually */
window.CPN_ACQUISITIONS = ${JSON.stringify(payload, null, 2)};
`;
  fs.writeFileSync(outJs, js);
  console.log(`Wrote ${outJs} (${acquisitions.length} acquisitions)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
