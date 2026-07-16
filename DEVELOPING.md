# Developing & preview deployments

## URLs

| Environment | URL | Git source |
|---|---|---|
| **Production** | https://bnarcum.github.io/cisco-portfolio-navigator/ | `main` on `origin` |
| **Preview** | https://bnarcum.github.io/cisco-portfolio-navigator-preview/ | `dev` pushed to `preview` remote |

Production also appears on the [Cisco internal tools hub](https://wwwin-github.cisco.com/pages/bnarcum/cisco-tools/). Only merge to `main` when you intend to update that live site.

## Remotes

```text
origin   → github.com/bnarcum/cisco-portfolio-navigator.git      (production)
preview  → github.com/bnarcum/cisco-portfolio-navigator-preview.git (sandbox)
```

## Daily workflow

```bash
git checkout dev

# edit cisco-portfolio-navigator.html, assets, JSON, etc.

git add -A && git commit -m "Describe your enhancement"
git push preview dev:main    # publishes to the preview URL (~1 min)
git push origin dev          # optional backup of dev branch on GitHub
```

Share the preview URL with colleagues while you iterate. The orange banner at the top marks it as non-production.

## Promote to production

When preview looks good:

```bash
git checkout main
git merge dev
git push origin main         # updates production GitHub Pages
git push preview dev:main    # if you also need preview updated
```

Or from `dev`, push everything and **wait until live** (recommended):

```bash
npm run deploy
```

This merges `dev` → `main`, pushes `origin` + `preview`, then polls GitHub Pages until the live HTML serves the local `APP_VERSION` (usually 1–6 minutes).

### Verify without pushing

If you already pushed:

```bash
npm run deploy:verify
```

CI also runs `.github/workflows/verify-github-pages.yml` on every push to `main` and fails the check if production is still serving an old version after the timeout.

**Why it feels “not live yet”:** GitHub Pages legacy builds are asynchronous. `git push` returns before the site updates. Always run `deploy:verify` before telling anyone a version is live.

### If production is stuck (wedged deploy)

**Cause:** GitHub's built-in `pages-build-deployment` workflow creates `github-pages` environment deployments. A stale SUCCESS (or piled-up FAILURE) deployment blocks new deploys with *"in progress deployment"*, leaving legacy builds stuck in `building`/`errored`.

**Automatic fix (built into deploy):** `npm run deploy` now runs `pages-recovery` after each push and retries verify once if needed. `deploy:verify` also auto-recovers when it detects a wedged build.

**Manual recovery:**

```bash
npm run deploy:recover        # production only
npm run deploy:recover:all    # production + preview
npm run deploy:verify
```

See also `.cursor/rules/github-pages-deploy.mdc` for the underlying `gh` commands.

Keep experimenting on `dev` — production stays untouched until you merge and push `main`.

## Local testing

No build step required:

```bash
python3 -m http.server 8765
# open http://localhost:8765/cisco-portfolio-navigator.html
```

Playwright tests (optional):

```bash
npm test
```
