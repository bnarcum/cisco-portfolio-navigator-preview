#!/usr/bin/env node
/**
 * Unwedge GitHub Pages legacy deploys blocked by stale github-pages deployments.
 *
 * Root cause: GitHub's built-in pages-build-deployment workflow uses
 * actions/deploy-pages, which creates github-pages environment deployments.
 * A stale SUCCESS (or piled-up FAILURE) deployment blocks new deploys with
 * "in progress deployment", leaving legacy builds stuck in building/errored.
 *
 * Usage:
 *   node scripts/pages-recovery.mjs --repo production
 *   node scripts/pages-recovery.mjs --repo preview
 *   node scripts/pages-recovery.mjs --repo production --sha abc1234
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const REPOS = {
  production: { slug: "bnarcum/cisco-portfolio-navigator", branch: "main", path: "/" },
  preview: { slug: "bnarcum/cisco-portfolio-navigator-preview", branch: "main", path: "/" }
};

function parseArgs(argv) {
  const opts = { repo: "production", sha: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo" && argv[i + 1]) opts.repo = argv[++i];
    else if (a === "--sha" && argv[i + 1]) opts.sha = argv[++i];
    else if (a === "--quiet" || a === "-q") opts.quiet = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/pages-recovery.mjs [--repo production|preview] [--sha <commit>]`);
      process.exit(0);
    }
  }
  return opts;
}

function log(msg, quiet) {
  if (!quiet) console.log(msg);
}

function ghApi(path, { method = "GET", fields = null } = {}) {
  let cmd = `gh api -X ${method} ${path}`;
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      cmd += ` -f ${k}=${JSON.stringify(v)}`;
    }
  }
  try {
    const out = execSync(cmd, { encoding: "utf8", cwd: ROOT });
    return out.trim() ? JSON.parse(out) : null;
  } catch (err) {
    const stderr = err.stderr?.toString() || err.message;
    throw new Error(stderr.trim() || `gh api failed: ${path}`);
  }
}

function ghGraphql(query) {
  const q = query.replace(/'/g, "'\\''");
  const out = execSync(`gh api graphql -f query='${q}'`, { encoding: "utf8", cwd: ROOT });
  const parsed = JSON.parse(out);
  if (parsed.errors?.length) {
    throw new Error(parsed.errors.map(e => e.message).join("; "));
  }
  return parsed.data;
}

function ghAvailable() {
  try {
    execSync("gh api repos/bnarcum/cisco-portfolio-navigator/pages --jq .status", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function expectedSha(opts, slug) {
  if (opts.sha) return opts.sha;
  try {
    if (opts.repo === "production") {
      return execSync("git rev-parse origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    }
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function listDeployments(owner, name) {
  const data = ghGraphql(
    `query { repository(owner:"${owner}", name:"${name}") { deployments(first:12, environments:["github-pages"], orderBy:{field:CREATED_AT, direction:DESC}) { nodes { id commitOid latestStatus { state } } } } }`
  );
  return data?.repository?.deployments?.nodes || [];
}

function deleteDeployment(id) {
  try {
    ghGraphql(`mutation { deleteDeployment(input:{id:"${id}"}) { clientMutationId } }`);
    return true;
  } catch (err) {
    if (/cannot delete an active deployment/i.test(err.message)) return false;
    throw err;
  }
}

function inactivateDeployment(id) {
  ghGraphql(
    `mutation { createDeploymentStatus(input:{deploymentId:"${id}", state:INACTIVE}) { deploymentStatus { state } } }`
  );
}

function latestPagesWorkflowRun(slug, sha) {
  try {
    const raw = execSync(
      `gh run list --repo ${slug} --workflow pages-build-deployment --limit 6 --json databaseId,conclusion,headSha,status`,
      { encoding: "utf8", cwd: ROOT }
    );
    const runs = JSON.parse(raw);
    return runs.find(r => r.headSha?.startsWith(sha.slice(0, 7)) || r.headSha === sha) || runs[0] || null;
  } catch {
    return null;
  }
}

function isWedged(pagesMeta, build, deployments, expectedShaFull) {
  if (!pagesMeta) return false;
  if (pagesMeta.status === "errored") return true;

  const sha7 = expectedShaFull?.slice(0, 7);
  const failures = deployments.filter(d => d.latestStatus?.state === "FAILURE");
  const successOther = deployments.find(
    d => d.latestStatus?.state === "SUCCESS" && !d.commitOid?.startsWith(sha7)
  );
  const successExpected = deployments.find(
    d => d.latestStatus?.state === "SUCCESS" && d.commitOid?.startsWith(sha7)
  );

  if (failures.length > 0 && !successExpected) return true;
  if (successOther && !successExpected) return true;
  if (build?.status === "building" && (build.duration === 0 || build.duration == null)) return true;

  return false;
}

export async function recoverPages(target, opts = {}) {
  const quiet = opts.quiet ?? false;
  const cfg = REPOS[target];
  if (!cfg) throw new Error(`Unknown repo target: ${target}`);

  const [owner, name] = cfg.slug.split("/");
  const sha = expectedSha({ repo: target, sha: opts.sha }, cfg.slug);
  const actions = [];

  log(`\n[pages-recovery:${target}] repo=${cfg.slug} expected=${sha?.slice(0, 7) || "?"}`, quiet);

  let pagesMeta = null;
  let build = null;
  try {
    pagesMeta = ghApi(`repos/${cfg.slug}/pages`);
    const builds = ghApi(`repos/${cfg.slug}/pages/builds?per_page=1`);
    build = Array.isArray(builds) ? builds[0] : null;
  } catch (err) {
    log(`  pages API unavailable: ${err.message}`, quiet);
  }

  let deployments = [];
  try {
    deployments = listDeployments(owner, name);
  } catch (err) {
    log(`  deployments API unavailable: ${err.message}`, quiet);
    return { recovered: false, reason: "no-gh" };
  }

  const wedged = isWedged(pagesMeta, build, deployments, sha);
  log(`  pages=${pagesMeta?.status || "?"} build=${build?.status || "?"} deployments=${deployments.length} wedged=${wedged}`, quiet);

  if (!wedged && pagesMeta?.status === "built") {
    log(`  no recovery needed`, quiet);
    return { recovered: false, reason: "healthy" };
  }

  // 1) Delete FAILURE deployments (safe; clears wedged failure nodes)
  for (const d of deployments.filter(x => x.latestStatus?.state === "FAILURE")) {
    if (deleteDeployment(d.id)) {
      actions.push(`deleted FAILURE ${d.commitOid?.slice(0, 7)}`);
    }
  }

  // Refresh after deletes
  deployments = listDeployments(owner, name);
  const sha7 = sha?.slice(0, 7);
  const hasSuccessForExpected = deployments.some(
    d => d.latestStatus?.state === "SUCCESS" && d.commitOid?.startsWith(sha7)
  );

  // 2) Inactivate stale SUCCESS on older commits that block new deploys
  if (!hasSuccessForExpected) {
    for (const d of deployments.filter(x => x.latestStatus?.state === "SUCCESS")) {
      if (!d.commitOid?.startsWith(sha7)) {
        try {
          inactivateDeployment(d.id);
          actions.push(`inactivated SUCCESS ${d.commitOid?.slice(0, 7)}`);
        } catch (err) {
          log(`  could not inactivate ${d.id}: ${err.message}`, quiet);
        }
      }
    }
  }

  // 3) Reaffirm legacy-only Pages (never workflow — conflicts with pages-build-deployment)
  try {
    ghApi(`repos/${cfg.slug}/pages`, {
      method: "PUT",
      fields: { build_type: "legacy", "source[branch]": cfg.branch, "source[path]": cfg.path }
    });
    actions.push("reaffirmed legacy pages");
  } catch (err) {
    log(`  legacy reaffirm failed: ${err.message}`, quiet);
  }

  // 4) Rerun failed pages-build-deployment for expected commit, else queue legacy build
  const run = sha ? latestPagesWorkflowRun(cfg.slug, sha) : null;
  if (run?.conclusion === "failure" && run.status === "completed") {
    try {
      execSync(`gh run rerun ${run.databaseId} --repo ${cfg.slug} --failed`, {
        cwd: ROOT, stdio: quiet ? "ignore" : "inherit"
      });
      actions.push(`reran pages-build-deployment #${run.databaseId}`);
    } catch (err) {
      log(`  workflow rerun failed: ${err.message}`, quiet);
      try {
        ghApi(`repos/${cfg.slug}/pages/builds`, { method: "POST" });
        actions.push("queued legacy pages build (fallback)");
      } catch (e2) {
        log(`  legacy build queue failed: ${e2.message}`, quiet);
      }
    }
  } else if (pagesMeta?.status === "errored" || build?.status === "building") {
    try {
      ghApi(`repos/${cfg.slug}/pages/builds`, { method: "POST" });
      actions.push("queued legacy pages build");
    } catch (err) {
      log(`  legacy build queue failed: ${err.message}`, quiet);
    }
  }

  log(`  actions: ${actions.length ? actions.join("; ") : "(none)"}`, quiet);
  return { recovered: actions.length > 0, actions, reason: wedged ? "wedged" : "repaired" };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!ghAvailable()) {
    console.error("pages-recovery requires authenticated gh CLI");
    process.exit(1);
  }
  const target = REPOS[opts.repo] ? opts.repo : null;
  if (!target) {
    console.error(`Unknown --repo ${opts.repo}. Use production or preview.`);
    process.exit(1);
  }
  const result = await recoverPages(target, opts);
  if (!result.recovered) process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
