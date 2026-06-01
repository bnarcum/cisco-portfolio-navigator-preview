# Cisco Portfolio Navigator

<p align="center">
  <a href="https://bnarcum.github.io/cisco-portfolio-navigator/">
    <img src="docs/hero.png" alt="Cisco Portfolio Navigator — interactive portfolio graph and Account Planner" width="100%">
  </a>
</p>

An interactive, single-file HTML tool for exploring the Cisco product portfolio and building customer account plans with augmentation, replacement, and bundle recommendations.

**Live demo:** https://bnarcum.github.io/cisco-portfolio-navigator/

## What it does

- **Guided Plan** — 5-step wizard (industry → size → capabilities → legacy refresh) that builds your stack, runs analysis, and generates inline AI deliverables (exec summary, 90-day roadmap, customer email, gap analysis)
- **Six view modes** — same portfolio data, multiple lenses:
  - **Overview** — 5 category bubbles (Networking / Security / Collaboration / Computing / Observability) for first-look conversations
  - **Families** — 54 product families *(default)*, the classic D3 force-directed map of how things connect
  - **Composition** — one family pinned in the middle with every specific SKU around it; dashed purple *"replaced by"* arrows show succession chains
  - **All** — every family + every product (~370 nodes) in one dense graph for power users
  - **Spatial** — optional immersive **3D** map of product families with always-visible name labels; orbit (drag), zoom (scroll), and click any node for the detail panel. Respects the same category / use-case / industry filters and stack highlights as 2D. **Double-click** a family — or **Explore N products →** on its panel — to drill into a 3D composition where SKUs orbit the family center with purple succession links. Bundled locally (no CDN); requires WebGL.
  - **Scenarios** — **I need to…** outcome picker (8 curated solution paths aligned to reference architectures), **Stack flow** diagram (layers top → bottom with traffic arrows), and **Where it runs** deployment matrix (cloud vs on-prem × inline vs out-of-band + endpoint). Highlights account-stack coverage; **Open in graph** overlays the reference arch; **Add gaps to plan** fills the planner. Press **Y** to toggle.
- **Drill down anywhere**: switch with the topbar segmented control, **double-click** a family bubble (2D Composition or Spatial composition), click **"Explore N products →"** on any family panel, or **search for a product** — the graph auto-promotes into that product's family. A breadcrumb chip under the topbar tracks your level; in Spatial, `Esc` steps back one level at a time.
- **Visualize the portfolio** as an interactive D3 force-directed graph in 2D (zoom, drag, click for details, right-click for quick actions) or in optional 3D Spatial view
- **Search any product** — both families (ISE, Meraki, Webex Devices, AI Defense, Cisco 8000 Secure Routers) and **325+ specific models** spanning every major Cisco wave from Cisco Live 2025 through early-2026: Catalyst 9350/9610 Smart Switches (Silicon One G300), Secure Routers 8100–8500, Wireless 9179F (Wi-Fi 7 + URWB), Desk Pro G2, Wireless Phone 9821, AI Defense (Cloud Visibility / Validation / Runtime / BOM), Nexus 9800 AI spine, UCS C845A M8, plus the full legacy lineage with EOL bulletins.
- **Filter** by category, use case, industry, EOL/EOS status, or licensing tier
- **Build account plans** — add a customer's existing Cisco stack and get scored recommendations for:
  - **Augment** — complementary products to expand footprint
  - **Replace** — EOL/EOS items with their official successors and migration paths
  - **Bundles** — pre-defined solution bundles the stack partially covers
  - **Coverage** — use cases & industries the current stack addresses
  - **Migrate** — actionable migration plan with dates & successors
  - **Warnings** — compatibility & dependency gaps
- **EOS / EOL Timeline** — Gantt-style view of every product's lifecycle, with zoom (`+` / `-` / `0` / `⌘ + scroll`)
- **Industry starter templates** — one-click stacks for Hospital, K-12, Manufacturing, Retail, etc.
- **Customer profile** — bias recommendations toward cloud-first vs hybrid vs on-prem
- **Compare mode** — pin 2–4 products or families side-by-side; inline ⇆ button on every Recent / Pinned item
- **Reference architectures** — overlay the canonical product stack for any use case
- **Saved plans + shareable URL** — auto-save, name plans, share encoded state via link
- **Multi-format export** — Markdown, CSV, JSON, PDF (print), PPTX (discovery summary + AI deliverable slides), plain text
- **AI Assistant (BYOK)** — OpenRouter, Groq, Gemini (AI Studio), OpenAI, Anthropic, LM Studio, or Ollama to generate stacks, justify recommendations, or explore migrations
- **Last view + focus** persists across reloads in `localStorage`

## Usage

### Online (recommended)

Just visit https://bnarcum.github.io/cisco-portfolio-navigator/ in any modern browser. Nothing to install. Everything is client-side — saved plans and AI keys never leave your browser.

### Offline / local

```bash
git clone https://github.com/bnarcum/cisco-portfolio-navigator.git
cd cisco-portfolio-navigator
# Open the file in your browser (any method works):
open cisco-portfolio-navigator.html
# or serve it locally to enable the AI assistant with local models:
python3 -m http.server 8765
# then visit http://localhost:8765/cisco-portfolio-navigator.html
```

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` or `⌘K` / `Ctrl+K` | Focus search |
| `p` | Toggle account planner |
| `g` | Open Guided Plan wizard |
| `t` | Toggle EOS/EOL timeline view |
| `y` | Toggle Scenarios view (I need to… / stack / matrix) |
| `a` | Open AI assistant |
| `?` | (Re-)launch the guided tour |
| `←` / `→` / `↑` / `↓` | Walk between connected nodes (when one is selected) |
| `Enter` / `Space` | Open the focused node |
| `Esc` | Close panel / dialog / tour; in **Spatial**, step back one level (composition → map → Families) |

**Drill-down shortcuts (graph):**
- **Double-click** any family bubble → Composition view (2D) or Spatial composition (3D)
- **Click "Explore N products →"** on a family's detail panel → same drill in the current view mode
- **Search for a product** → graph auto-promotes to that product's family (2D modes)

The view-mode segmented control in the topbar is keyboard-focusable; the breadcrumb chip's `×` returns to the previous level (or Families from the top-level Spatial map).

## AI Assistant setup notes

The assistant works fully client-side via your own API key. It supports any OpenAI-compatible endpoint:

| Provider | Works from web (HTTPS hosted) | Works from `file://` | Notes |
|---|:-:|:-:|---|
| OpenRouter | ✅ | ✅ | Recommended — single key for OpenAI/Anthropic/Gemini/etc. |
| Groq | ✅ | ✅ | Fast, free tier |
| Google AI Studio (Gemini) | ✅ | ✅ | Free tier — OpenAI-compatible endpoint |
| OpenAI | ✅ | ❌ (CORS) | Use OpenRouter for browser access |
| Anthropic | ✅ | ❌ (CORS) | Use OpenRouter for browser access |
| LM Studio | ⚠️ * | ✅ | Local server — see notes below |
| Ollama | ⚠️ * | ✅ | Local server — see notes below |

\* When using the hosted version with a **local** model server (Ollama / LM Studio), browsers block the mixed `https://` → `http://localhost` request. Workarounds:
- Use the offline / local instructions above (serve the file via `python3 -m http.server`)
- Or download the HTML file and open it directly (`file://` works once you set `OLLAMA_ORIGINS="*"` and restart Ollama)

## Tech

Single HTML entry point (`cisco-portfolio-navigator.html`) with no build step. D3.js loads from a CDN for 2D views; **Spatial** lazy-loads vendored 3D libraries from `vendor/` (`3d-force-graph`, Three.js, `three-spritetext`) so the 3D map works offline and on networks that block external CDNs.

Internally, five view modes share one data model: the global `NODES` (54 families) and `LINKS` (family-to-family adjacencies) are the source of truth. 2D modes synthesize `viewNodes` / `viewLinks` for D3 (category bubbles for Overview, family + products + successor edges for Composition, the full union for All). **Spatial** builds parallel graph payloads for `3d-force-graph`, including a composition sub-level where the family node is pinned at the origin and products orbit it. Per-mode force tuning (charge, link distance) keeps layouts readable from 5 nodes to ~370. Spatial requires WebGL.

## License

Personal / educational use. Cisco product names, descriptions, and trademarks are property of Cisco Systems, Inc.
