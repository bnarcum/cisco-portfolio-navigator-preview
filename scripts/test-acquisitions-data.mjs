#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  mergeRecords,
  parseWikiTable,
} from "./build-acquisitions.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = JSON.parse(fs.readFileSync(path.join(root, "assets/cpn-acquisitions.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/acq-logos/manifest.json"), "utf8"));
const errors = [];
const normalized = new Set();
const normalizedNameDates = new Set();
const normalizedCompany = name => name.toLowerCase()
  .replace(/\b(communications|technologies|technology|group|inc|llc|ltd|corp|corporation|limited)\b/g, "")
  .replace(/[^a-z0-9]+/g, "");

const wikiFixture = fs.readFileSync(
  path.join(root, "scripts/fixtures/wikipedia-acquisitions-table.html"),
  "utf8",
);
const fixtureRows = parseWikiTable(wikiFixture);
const fixtureLinksys = fixtureRows.find(row => row.company === "Linksys");
const fixtureExample = fixtureRows.find(row => row.company === "Example & Company");
const fixtureRowspan = fixtureRows.find(row => row.company === "Second Example");
if (fixtureLinksys?.country !== "United States" || fixtureLinksys?.valueUsd !== 500000000) {
  errors.push(`wiki fixture: Linksys semantics ${fixtureLinksys?.country}/${fixtureLinksys?.valueUsd}`);
}
if (fixtureExample?.country !== "United States" ||
    fixtureExample?.business !== "Security & analytics") {
  errors.push("wiki fixture: entities or semantic columns were not decoded");
}
if (fixtureRowspan?.announced !== "2020-01-02" ||
    fixtureRowspan?.country !== "United Kingdom") {
  errors.push("wiki fixture: rowspan values were not propagated");
}

const aliasMerge = mergeRecords(
  [
    { company: "WebEx", announced: "2007-03-15", business: "Collaboration", country: "", valueUsd: 1 },
    { company: "Jasper Technologies", announced: "2016-02-03", business: "IoT", country: "", valueUsd: 2 },
  ],
  [
    { company: "WebEx Communications, Inc.", announced: "2007-03-15", summary: "Cisco WebEx" },
    { company: "Jasper Technologies, Inc.", announced: "2016-02-03", summary: "Cisco Jasper" },
  ],
);
if (aliasMerge.length !== 2 ||
    !aliasMerge.some(record => record.id === "webex" && record.sources.length === 2) ||
    !aliasMerge.some(record => record.id === "jasper" && record.sources.length === 2)) {
  errors.push(`merge: canonical aliases were not deduplicated (${aliasMerge.map(row => row.id).join(",")})`);
}

const [precedence] = mergeRecords(
  [{
    company: "Example, Inc.",
    announced: "2018-01-02",
    business: "Wikipedia business",
    country: "United States",
    valueUsd: 42,
  }],
  [{
    company: "Example",
    announced: "2021-03-04",
    summary: "Cisco summary",
  }],
);
if (precedence.announced !== "2021-03-04") errors.push("merge: Cisco date did not take precedence");
if (precedence.summary !== "Cisco summary") errors.push("merge: Cisco summary did not take precedence");
if (precedence.era !== "security") errors.push("merge: era was not recomputed from Cisco date");
if (precedence.country !== "United States" || precedence.valueUsd !== 42) {
  errors.push("merge: Wikipedia country/value were not preserved");
}

for (const acq of data.acquisitions) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acq.announced)) errors.push(`${acq.id}: invalid date`);
  if (/^\s*(?:US)?\$/i.test(acq.country || "")) errors.push(`${acq.id}: monetary country`);
  if (acq.valueUsd != null && (!Number.isFinite(acq.valueUsd) || acq.valueUsd <= 0)) {
    errors.push(`${acq.id}: invalid value`);
  }
  if (normalized.has(acq.id)) errors.push(`${acq.id}: duplicate normalized id`);
  normalized.add(acq.id);
  const normalizedNameDate = `${normalizedCompany(acq.company)}|${acq.announced}`;
  if (normalizedNameDates.has(normalizedNameDate)) {
    errors.push(`${acq.id}: duplicate normalized name/date`);
  }
  normalizedNameDates.add(normalizedNameDate);
  if (!acq.visualIdentity) errors.push(`${acq.id}: missing visualIdentity`);
  if (acq.visualIdentity && !fs.existsSync(path.join(root, acq.visualIdentity.path))) {
    errors.push(`${acq.id}: missing visual identity asset`);
  }
  if (acq.visualIdentity?.kind === "verified-logo" && !acq.visualIdentity.sourceUrl) {
    errors.push(`${acq.id}: verified logo missing source URL`);
  }
  if (manifest.items[acq.id]?.source === "favicon-png" &&
      acq.visualIdentity?.kind === "verified-logo") {
    errors.push(`${acq.id}: guessed favicon marked verified`);
  }
}

const linksys = data.acquisitions.find(acq => acq.id === "linksys");
if (!linksys || linksys.country !== "United States" || linksys.valueUsd !== 500000000 ||
    !linksys.sources.includes("wikipedia") || !linksys.sources.includes("cisco")) {
  errors.push(`dataset: Linksys semantic merge invalid (${JSON.stringify(linksys)})`);
}
for (const duplicateId of ["linksys-group", "webex-communications", "jasper-technologies"]) {
  if (data.acquisitions.some(acq => acq.id === duplicateId)) {
    errors.push(`dataset: alias duplicate remains (${duplicateId})`);
  }
}

if (errors.length) {
  console.error(`FAIL test-acquisitions-data\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`OK test-acquisitions-data (${data.acquisitions.length} acquisitions)`);
