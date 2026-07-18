#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeRecords } from "./build-acquisitions.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = JSON.parse(fs.readFileSync(path.join(root, "assets/cpn-acquisitions.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/acq-logos/manifest.json"), "utf8"));
const errors = [];
const normalized = new Set();

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
  if (normalized.has(acq.id)) errors.push(`${acq.id}: duplicate normalized id`);
  normalized.add(acq.id);
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

if (errors.length) {
  console.error(`FAIL test-acquisitions-data\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`OK test-acquisitions-data (${data.acquisitions.length} acquisitions)`);
