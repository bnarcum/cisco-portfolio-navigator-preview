#!/usr/bin/env node
/**
 * Compare matrix-bridge.json against collaboration-device-matrix deviceImages.ts.
 * Flags missing bridge entries, stale G2-only board mappings, and broken CDN hashes.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bridge = JSON.parse(fs.readFileSync(path.join(root, "matrix-bridge.json"), "utf8"));

const matrixTsCandidates = [
  path.resolve(root, "../Cursor Device Matrix/collaboration-device-matrix/src/data/deviceImages.ts"),
  path.resolve(process.env.HOME || "", "Projects/Cursor Device Matrix/collaboration-device-matrix/src/data/deviceImages.ts"),
];
const matrixTs = matrixTsCandidates.find(p => fs.existsSync(p));

const issues = [];
const matrixIds = new Set();
const matrixHashes = new Map();

if (!matrixTs) {
  console.warn("WARN: collaboration-device-matrix deviceImages.ts not found locally — CDN checks only");
} else {
  const src = fs.readFileSync(matrixTs, "utf8");
  for (const m of src.matchAll(/(?:'([^']+)'|([a-z0-9-]+)):\s*img\('([0-9a-f]+)'\)/g)) {
    const id = m[1] || m[2];
    matrixIds.add(id);
    matrixHashes.set(id, m[3]);
  }
}

const requiredBoard = ["board-pro-g3-55", "board-pro-g3-75"];
for (const id of requiredBoard) {
  const e = bridge.products?.[id];
  if (!e) issues.push(`missing bridge entry: ${id}`);
  else if (e.matrixId !== id) {
    issues.push(`${id}: matrixId should be ${id}, got ${e.matrixId}`);
  } else if (e.hash !== "9dc39ce9a6") {
    issues.push(`${id}: expected G3 hash 9dc39ce9a6, got ${e.hash || "none"}`);
  }
}

for (const [id, e] of Object.entries(bridge.products || {})) {
  if (!e.matrixId) issues.push(`${id}: missing matrixId`);
  if (matrixIds.size && e.matrixId && !matrixIds.has(e.matrixId) && !e.image) {
    issues.push(`${id}: matrixId ${e.matrixId} not in deviceImages.ts`);
  }
  if (matrixHashes.size && e.matrixId && e.hash) {
    const expected = matrixHashes.get(e.matrixId);
    if (expected && expected !== e.hash) {
      issues.push(`${id}: hash ${e.hash} stale — matrix has ${expected} for ${e.matrixId}`);
    }
  }
}

const imageBase = bridge.imageBase || "https://bnarcum.github.io/collaboration-device-matrix/devices/";
const hashChecks = [...new Set(
  Object.values(bridge.products || {})
    .filter(e => e.hash && !e.image)
    .map(e => e.hash)
)].slice(0, 12);

for (const hash of hashChecks) {
  try {
    const res = await fetch(`${imageBase}img-${hash}.webp`, { method: "HEAD" });
    if (!res.ok) issues.push(`CDN missing img-${hash}.webp (${res.status})`);
  } catch (err) {
    issues.push(`CDN check failed for img-${hash}.webp: ${err.message}`);
  }
}

if (issues.length) {
  console.error("Matrix bridge audit FAILED:\n");
  issues.forEach(i => console.error("  -", i));
  process.exit(1);
}
console.log("Matrix bridge audit OK");
console.log(`  bridge products: ${Object.keys(bridge.products || {}).length}`);
if (matrixIds.size) console.log(`  matrix images:   ${matrixIds.size}`);
