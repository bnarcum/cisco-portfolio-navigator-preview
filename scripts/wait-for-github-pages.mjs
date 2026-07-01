#!/usr/bin/env node
/**
 * Poll GitHub Pages until the live site serves the expected APP_VERSION.
 *
 * Usage:
 *   node scripts/wait-for-github-pages.mjs
 *   node scripts/wait-for-github-pages.mjs --version 2.79.17
 *   node scripts/wait-for-github-pages.mjs --targets production
 *   node scripts/wait-for-github-pages.mjs --timeout 420
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "cisco-portfolio-navigator.html");

const TARGETS = {
  production: {
    repo: "bnarcum/cisco-portfolio-navigator",
    url: "https://bnarcum.github.io/cisco-portfolio-navigator/cisco-portfolio-navigator.html"
  },
  preview: {
    repo: "bnarcum/cisco-portfolio-navigator-preview",
    url: "https://bnarcum.github.io/cisco-portfolio-navigator-preview/cisco-portfolio-navigator.html"
  }
};

function parseArgs(argv) {
  const opts = {
    version: null,
    targets: ["production", "preview"],
    timeoutSec: 360,
    intervalSec: 12
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version" && argv[i + 1]) opts.version = argv[++i];
    else if (a === "--targets" && argv[i + 1]) opts.targets = argv[++i].split(",").map(s => s.trim());
    else if (a === "--timeout" && argv[i + 1]) opts.timeoutSec = Number(argv[++i]);
    else if (a === "--interval" && argv[i + 1]) opts.intervalSec = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/wait-for-github-pages.mjs [options]

Options:
  --version <semver>     Expected APP_VERSION (default: read from local HTML)
  --targets <list>       production, preview, or both (default: both)
  --timeout <seconds>    Max wait per target (default: 360)
  --interval <seconds>   Poll interval (default: 12)
`);
      process.exit(0);
    }
  }
  return opts;
}

function readLocalVersion() {
  const html = fs.readFileSync(HTML, "utf8");
  const m = html.match(/const APP_VERSION\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("APP_VERSION not found in cisco-portfolio-navigator.html");
  return m[1];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ghAvailable() {
  try {
    execSync("gh auth status", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function pagesMeta(repo) {
  try {
    const raw = execSync(`gh api repos/${repo}/pages`, { encoding: "utf8" });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function latestBuild(repo) {
  try {
    const raw = execSync(`gh api repos/${repo}/pages/builds?per_page=1`, { encoding: "utf8" });
    const list = JSON.parse(raw);
    return list[0] || null;
  } catch {
    return null;
  }
}

async function fetchLiveVersion(pageUrl) {
  const res = await fetch(`${pageUrl}?_cb=${Date.now()}`, {
    redirect: "follow",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pageUrl}`);
  const text = await res.text();
  const m = text.match(/const APP_VERSION\s*=\s*"([^"]+)"/);
  return m?.[1] || null;
}

async function waitForTarget(name, target, expected, timeoutSec, intervalSec, useGh) {
  const deadline = Date.now() + timeoutSec * 1000;
  let lastLive = null;
  let lastBuild = null;
  let polls = 0;

  console.log(`\n[${name}] waiting for v${expected}`);
  console.log(`  ${target.url}`);

  while (Date.now() < deadline) {
    polls++;
    let buildStatus = "unknown";
    if (useGh) {
      const build = latestBuild(target.repo);
      lastBuild = build;
      buildStatus = build?.status || pagesMeta(target.repo)?.status || "unknown";
    }

    try {
      lastLive = await fetchLiveVersion(target.url);
    } catch (err) {
      lastLive = null;
      console.log(`  poll ${polls}: build=${buildStatus} live=error (${err.message})`);
      await sleep(intervalSec * 1000);
      continue;
    }

    console.log(`  poll ${polls}: build=${buildStatus} live=v${lastLive || "?"}`);

    if (lastLive === expected) {
      console.log(`[${name}] OK — v${expected} is live`);
      return { ok: true, live: lastLive, build: lastBuild };
    }

    await sleep(intervalSec * 1000);
  }

  console.error(`[${name}] TIMEOUT — expected v${expected}, last saw v${lastLive || "?"}`);
  return { ok: false, live: lastLive, build: lastBuild };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const expected = opts.version || readLocalVersion();
  const useGh = ghAvailable();

  if (!useGh) {
    console.warn("gh CLI not authenticated — polling live URLs only (no build metadata).");
  }

  console.log(`Expecting APP_VERSION ${expected} on: ${opts.targets.join(", ")}`);

  const results = {};
  let allOk = true;

  for (const name of opts.targets) {
    const target = TARGETS[name];
    if (!target) {
      console.error(`Unknown target: ${name}`);
      process.exit(1);
    }
    results[name] = await waitForTarget(name, target, expected, opts.timeoutSec, opts.intervalSec, useGh);
    if (!results[name].ok) allOk = false;
  }

  console.log("\n--- Summary ---");
  for (const [name, r] of Object.entries(results)) {
    const url = TARGETS[name].url;
    console.log(`${r.ok ? "✓" : "✗"} ${name}: v${r.live || "?"} ${r.ok ? "" : `(wanted v${expected})`}`);
    console.log(`    ${url}`);
  }

  if (!allOk) {
    console.error("\nDeploy verification failed. Hard-refresh may still show a cached build.");
    console.error("Check: https://github.com/bnarcum/cisco-portfolio-navigator/settings/pages");
    process.exit(1);
  }

  console.log("\nAll targets verified live.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
