#!/usr/bin/env node
/**
 * Standard GitHub Pages deploy: push remotes, recover wedged Pages, verify live.
 *
 * Usage:
 *   node scripts/deploy.mjs              # verify only (after you pushed)
 *   node scripts/deploy.mjs --push       # merge main + push all remotes + verify
 *   node scripts/deploy.mjs --push --skip-preview
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { recoverPages } from "./pages-recovery.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseArgs(argv) {
  return {
    push: argv.includes("--push"),
    skipPreview: argv.includes("--skip-preview"),
    skipProduction: argv.includes("--skip-production"),
    verifyOnly: argv.includes("--verify-only") || !argv.includes("--push")
  };
}

function currentBranch() {
  return execSync("git branch --show-current", { cwd: ROOT, encoding: "utf8" }).trim();
}

async function recoverTarget(name) {
  try {
    console.log(`\n--- Pages recovery (${name}) ---`);
    const result = await recoverPages(name);
    if (result.recovered) {
      console.log(`Recovery applied: ${result.actions?.join("; ") || "ok"}`);
    } else {
      console.log(`No recovery needed (${result.reason || "healthy"})`);
    }
  } catch (err) {
    console.warn(`Pages recovery warning (${name}): ${err.message}`);
  }
}

async function verify(targets) {
  const verifyCmd = `node scripts/wait-for-github-pages.mjs --targets ${targets.join(",")}`;
  run(verifyCmd);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.push) {
    const branch = currentBranch();
    if (branch !== "dev") {
      console.error("deploy --push expects to run on branch dev");
      process.exit(1);
    }
    run("git push origin dev");
    run("git checkout main");
    run("git merge dev -m \"Merge dev for GitHub Pages deploy\"");
    run("git push origin main");
    if (!opts.skipProduction) {
      console.log("\nWaiting 8s for pages-build-deployment to start…");
      await sleep(8000);
      await recoverTarget("production");
    }
    run("git checkout dev");
    if (!opts.skipPreview) {
      run("git push preview dev:main");
      console.log("\nWaiting 5s for preview Pages build…");
      await sleep(5000);
      await recoverTarget("preview");
    }
  }

  const targets = [];
  if (!opts.skipProduction) targets.push("production");
  if (!opts.skipPreview) targets.push("preview");

  try {
    await verify(targets);
  } catch {
    // wait-for-github-pages exits 1 on timeout — try one recovery pass then re-verify
    console.warn("\nDeploy verify failed — running automatic Pages recovery and retrying once…");
    if (!opts.skipProduction) await recoverTarget("production");
    if (!opts.skipPreview) await recoverTarget("preview");
    await sleep(15000);
    await verify(targets);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
