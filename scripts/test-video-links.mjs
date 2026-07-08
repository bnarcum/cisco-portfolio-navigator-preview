#!/usr/bin/env node
/** video-links.json — schema, allowlisted hosts, product/family refs. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const htmlPath = path.join(root, "cisco-portfolio-navigator.html");
const data = JSON.parse(fs.readFileSync(path.join(root, "video-links.json"), "utf8"));
const entries = data.entries || [];
const errors = [];

const html = fs.readFileSync(htmlPath, "utf8");
const familyIds = new Set([...html.matchAll(/\{id:"([^"]+)",\s*name:"[^"]+",\s*category:/g)].map(m => m[1]));
const productIds = new Set([...html.matchAll(/\{id:"([^"]+)",\s*name:"[^"]+",\s*family:/g)].map(m => m[1]));

function urlHostAllowed(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const h = u.hostname;
  if (h === "www.youtube.com" || h === "youtube.com") return true;
  if (h === "www.youtube-nocookie.com" || h === "youtube-nocookie.com") return true;
  if (h === "i.ytimg.com") return true;
  if (h.endsWith(".cisco.com") || h === "cisco.com") return true;
  return false;
}

for (const e of entries) {
  if (!e.id) errors.push("entry missing id");
  if (!e.url) errors.push(`${e.id}: missing url`);
  else if (!urlHostAllowed(e.url)) errors.push(`${e.id}: url not allowlisted — ${e.url}`);
  if (!e.embedUrl) errors.push(`${e.id}: missing embedUrl`);
  else if (!urlHostAllowed(e.embedUrl)) errors.push(`${e.id}: embedUrl not allowlisted`);
  if (!e.thumbnail) errors.push(`${e.id}: missing thumbnail`);
  else if (!urlHostAllowed(e.thumbnail)) errors.push(`${e.id}: thumbnail not allowlisted`);
  if (!e.duration) errors.push(`${e.id}: missing duration`);
  if (typeof e.durationSec !== "number" || e.durationSec < 1)
    errors.push(`${e.id}: durationSec must be a positive number`);
  if (!e.families?.length && !e.products?.length)
    errors.push(`${e.id}: needs families or products`);
  for (const f of e.families || []) {
    if (!familyIds.has(f)) errors.push(`${e.id}: unknown family ${f}`);
  }
  for (const p of e.products || []) {
    if (!productIds.has(p) && !familyIds.has(p))
      errors.push(`${e.id}: unknown product ${p}`);
  }
}

const sources = Object.keys(data.sources || {});
for (const e of entries) {
  if (e.source && !sources.includes(e.source))
    errors.push(`${e.id}: unknown source ${e.source}`);
}

const ids = entries.map(e => e.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) errors.push(`duplicate ids: ${[...new Set(dupes)].join(", ")}`);

if (entries.length < 10) errors.push(`expected >=10 video entries, got ${entries.length}`);

if (errors.length) {
  console.error("FAIL test-video-links:");
  errors.forEach(e => console.error(" -", e));
  process.exit(1);
}
console.log(`OK test-video-links (${entries.length} entries)`);
