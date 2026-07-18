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

const COMPANY_SUFFIX =
  /(?:,?\s+)(?:Inc(?:orporated)?|LLC|Ltd|PLC|Corp(?:oration)?|Limited|A\/S|A\.S|Group|Technologies|Technology)\.?$/i;
const COMPANY_ALIASES = new Map([
  ["webexcommunications", "webex"],
  ["jaspertechnologies", "jasper"],
]);

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeCompany(name) {
  let normalized = decodeHtmlEntities(name)
    .replace(/\([^)]*\)/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let previous;
  do {
    previous = normalized;
    normalized = normalized.replace(COMPANY_SUFFIX, "").trim();
  } while (normalized !== previous);
  return normalized;
}

export function canonicalCompanyKey(name) {
  const normalized = normalizeCompany(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return COMPANY_ALIASES.get(normalized) || normalized;
}

function slugify(name) {
  const normalized = normalizeCompany(name).toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  const canonical = canonicalCompanyKey(name);
  const normalizedSlug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (canonical !== compact ? canonical : normalizedSlug).slice(0, 64) || "unknown";
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
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cellText(html) {
  const sort = html.match(/data-sort-value="[^"]*?(\d{4}-\d{2}-\d{2})/);
  if (sort) return sort[1];
  return stripHtml(html);
}

export function parseWikiTable(html) {
  const rows = [];
  const pending = new Map();
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  let headers = [];
  while ((tr = trRe.exec(html))) {
    const rawCells = [];
    const tdRe = /<t([dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
    let td;
    while ((td = tdRe.exec(tr[1]))) {
      rawCells.push({
        heading: td[1].toLowerCase() === "h",
        rowspan: Math.max(1, Number(td[2].match(/\browspan=["']?(\d+)/i)?.[1] || 1)),
        text: cellText(td[3]),
      });
    }
    if (rawCells.length && rawCells.every(cell => cell.heading)) {
      headers = rawCells.map(cell => cell.text.toLowerCase());
      pending.clear();
      continue;
    }
    if (!rawCells.length) continue;

    const cells = [];
    let column = 0;
    const fillPending = () => {
      while (pending.has(column)) {
        const entry = pending.get(column);
        cells[column] = entry.text;
        entry.remaining -= 1;
        if (entry.remaining <= 0) pending.delete(column);
        column += 1;
      }
    };
    fillPending();
    for (const cell of rawCells) {
      fillPending();
      cells[column] = cell.text;
      if (cell.rowspan > 1) {
        pending.set(column, { text: cell.text, remaining: cell.rowspan - 1 });
      }
      column += 1;
    }
    fillPending();

    const dateIndex = Math.max(0, headers.findIndex(header => /^date\b/.test(header)));
    const companyIndex = headers.findIndex(header => /^company\b/.test(header));
    const businessIndex = headers.findIndex(header => /^business\b/.test(header));
    if (companyIndex >= 0 && cells.length >= 2) {
      const date = parseWikiDate(cells[dateIndex]);
      const company = cells[companyIndex]?.replace(/\s+/g, " ").trim();
      if (date && company) {
        const semanticTail = cells.slice(Math.max(businessIndex, companyIndex) + 1)
          .filter(value => value && !/^\[\s*\d+\s*\]$/.test(value));
        const moneyIndex = semanticTail.findIndex(value =>
          /^\s*(?:US)?\$\s*[\d,.]+|^\s*[\d,.]+\s+(?:million|billion)\b/i.test(value));
        const country = moneyIndex > 0
          ? semanticTail.slice(0, moneyIndex).join(" ").trim()
          : moneyIndex < 0 ? semanticTail.find(value => !/^(?:—|-)$/.test(value)) || "" : "";
        rows.push({
          announced: date,
          company,
          business: businessIndex >= 0 ? cells[businessIndex] || "" : "",
          country,
          valueUsd: moneyIndex >= 0 ? parseValue(semanticTail[moneyIndex]) : null,
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

function validateAcquisitions(payload, manifest, { allowMissingIdentities = false } = {}) {
  const errors = [];
  const ids = new Set();
  for (const acq of payload.acquisitions) {
    if (ids.has(acq.id)) errors.push(`duplicate id: ${acq.id}`);
    ids.add(acq.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acq.announced)) {
      errors.push(`invalid date: ${acq.id}`);
    }
    if (/^\s*(?:US)?\$/i.test(acq.country || "")) {
      errors.push(`monetary value parsed as country: ${acq.id}`);
    }
    if (acq.valueUsd != null && (!Number.isFinite(acq.valueUsd) || acq.valueUsd <= 0)) {
      errors.push(`invalid acquisition value: ${acq.id}`);
    }
    if (!allowMissingIdentities && !manifest.items?.[acq.id]) {
      errors.push(`missing manifest: ${acq.id}`);
    }
  }
  return errors;
}

export function mergeRecords(wiki, cisco) {
  const byKey = new Map();

  for (const w of wiki) {
    const id = slugify(w.company);
    const key = `${canonicalCompanyKey(w.company)}|${w.announced}`;
    byKey.set(key, {
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
    const canonical = canonicalCompanyKey(c.company);
    const exactKey = `${canonical}|${c.announced}`;
    const candidates = [...byKey.entries()].filter(([key]) => key.startsWith(`${canonical}|`));
    const existingKey = byKey.has(exactKey)
      ? exactKey
      : candidates.length === 1 ? candidates[0][0] : null;
    const existing = existingKey ? byKey.get(existingKey) : null;
    if (existing) {
      existing.announced = c.announced;
      existing.summary = c.summary || "";
      existing.era = eraForYear(+c.announced.slice(0, 4));
      if (!existing.sources.includes("cisco")) existing.sources.push("cisco");
    } else {
      byKey.set(exactKey, {
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

  const errors = validateAcquisitions(payload, manifest, {
    allowMissingIdentities: process.argv.includes("--allow-missing-identities"),
  });
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
