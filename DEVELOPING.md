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

## Kiosk mode (Desk Pro / Board Pro)

Set the device browser homepage to the kiosk attract screen:

| Environment | URL |
|---|---|
| **Production** | https://bnarcum.github.io/cisco-portfolio-navigator/kiosk.html |
| **Preview** | https://bnarcum.github.io/cisco-portfolio-navigator-preview/kiosk.html |

Touch a pillar tile to open the navigator in kiosk mode (`?mode=kiosk`). Optional query params:

- `pillar=workplaces` — deep-link straight into a pillar (also used from attract tiles)
- `idle=120` — seconds of inactivity before returning to `kiosk.html` (default 120)

The **Home** button (bottom-left) and idle timeout both return to the attract screen.

## AI Canvas (Cloud Control AgenticOps demo)

A reconstruction of the **Cisco AI Canvas** generative-UI workspace, composed from the current account plan and curated cross-domain investigation scenarios. Demo composition — **not live telemetry**.

- **Layout (matched to the product UI):** Cloud Control product nav + Assistant/Canvas/Actions sub-toolbar; **AI Assistant conversation** with composer (left); a masonry **widget board** (recently connected clients, application QoS policy, dual-axis application path health chart, network topology, top data center anomalies, threats blocked) center/right; a tool strip and zoom/minimap. The dashboard-name dropdown switches scenario boards.
- **Entry points:** the *Operations · Cloud Control* section on product/family panels (families with a Cloud Control adjacency), and the export menu → *Open in AI Canvas*.
- **Page:** `cloud-control-briefing.html` (opens in a new tab). Reads a handoff payload from `sessionStorage["cpn-cc-brief"]`; falls back to a representative demo estate when opened directly.
- **Data model:** `assets/cpn-cloud-control-ops.js` — `window.__cpnOps` maps families → operational profiles (Control Hub, observability signals) and cross-domain scenarios (question, severity, metric, topology, hypotheses, agent evidence, impact, action) plus `DOMAIN_AGENTS`. Shared by the panel and the canvas page.
- **Query params:** `?focus=<familyId>` selects the matching board; `?from=cpn` enables in-app back navigation.

Test: `npm run test:cloud-control`.

## Problems → Outcomes layer ("why it matters")

Adds the business-value axis on top of the portfolio (what) and connections (how). Curated, directional talking points — **not guarantees or live metrics**.

- **Data model:** `assets/cpn-problems.js` — `window.__cpnProblems` holds ~21 curated problems, each with `symptom` (customer language), `outcome`, `proof` (metric/before/after/source), `personas` (netops/cio/ciso), and keys that reuse the existing taxonomy: `families[]` (NODES ids), `bundles[]` (BUNDLES names), `useCases[]`, `dcloudPath` (dcloud-links path id), `pillar` (One Cisco), and `maturityNext` (expansion chain). One source of truth — no duplicated stacks.
- **Resolvers:** `problemsForFamily/Product/Stack/Bundle/UseCase`, `outcomeCoverage(familyIds)` (addressed vs. adjacent-open), `problemNarrative(familyIds, persona)`, `personaLine`, `SYMPTOMS`.
- **Phase 1 (reframe):** canvas **outcome card** (`#outcome-card`, node-attached on the graph) with symptom → outcome → proof, persona chips, primary problem + “+ N more” expand, and a consolidated **Journey** row (Explore → dCloud → AI Canvas → Skill up). Side panel is specs/products/links only. Pain-first **Solution package** headlines and *"Because …"* on **Suggestions** remain in the planner.
- **Phase 2 (credibility):** **Outcomes** panel tab (delivered vs. adjacent gaps, "add closers"), a **persona toggle** (NetOps/CIO/CISO, persisted in `localStorage["cpn-persona"]`, reframes every line), and the narrative flows into the **AI assistant** (`buildPlanContext`) and **exports** (`planSummary().problems` → markdown + text "Problems We Solve").
- **Phase 3 (wow):** Outcomes **graph lens** (`highlightProblemFamilies`), **symptom discovery** modal (`openSymptomPicker` — "What's hurting?"), **dCloud journey** link ("Prove it on dCloud"), **AI Canvas bridge** ("Investigate in AI Canvas" on ops-mapped outcomes), and **maturity chaining** ("Then: <next outcome>").
- **Entry points:** canvas outcome card on family/product selection, Outcomes tab, symptom picker, exports/AI context. Detailed dCloud lab list stays in the panel *Learn & Try on dCloud* section.

Test: `npm run test:problems`. Module: `assets/cpn-outcome-card.js` (`window.__cpnOutcomeCard`).
