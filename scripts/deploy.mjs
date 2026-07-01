#!/usr/bin/env node
/**
 * Standard GitHub Pages deploy: push remotes, then wait until live.
 *
 * Usage:
 *   node scripts/deploy.mjs              # verify only (after you pushed)
 *   node scripts/deploy.mjs --push       # merge main + push all remotes + verify
 *   node scripts/deploy.mjs --push --skip-preview
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
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

function main() {
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
    run("git checkout dev");
    if (!opts.skipPreview) {
      run("git push preview dev:main");
    }
  }

  const targets = [];
  if (!opts.skipProduction) targets.push("production");
  if (!opts.skipPreview) targets.push("preview");

  const verifyCmd = `node scripts/wait-for-github-pages.mjs --targets ${targets.join(",")}`;
  run(verifyCmd);
}

main();
