# Cisco Portfolio Navigator

An interactive, single-file HTML tool for exploring the Cisco product portfolio and building customer account plans with augmentation, replacement, and bundle recommendations.

**Live demo:** https://bnarcum.github.io/cisco-portfolio-navigator/

## What it does

- **Visualize the portfolio** as an interactive D3 force-directed graph (zoom, drag, click for details, right-click for quick actions)
- **Search any product** — both families (ISE, Meraki, Webex Devices) and specific models (Cisco Desk Pro, Catalyst 9300, ASA 5525-X)
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
- **Compare mode** — pin 2–4 products side-by-side
- **Reference architectures** — overlay the canonical product stack for any use case
- **Saved plans + shareable URL** — auto-save, name plans, share encoded state via link
- **Multi-format export** — Markdown, CSV, JSON, PDF (print), PPTX, plain text
- **AI Assistant** — bring your own key (OpenRouter, Groq, OpenAI, Anthropic, LM Studio, Ollama) to generate stacks from a scenario, justify recommendations, or explore migrations

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

## AI Assistant setup notes

The assistant works fully client-side via your own API key. It supports any OpenAI-compatible endpoint:

| Provider | Works from web (HTTPS hosted) | Works from `file://` | Notes |
|---|:-:|:-:|---|
| OpenRouter | ✅ | ✅ | Recommended — single key for OpenAI/Anthropic/Llama/etc. |
| Groq | ✅ | ✅ | Fast, free tier |
| OpenAI | ✅ | ❌ (CORS) | Use OpenRouter for browser access |
| Anthropic | ✅ | ❌ (CORS) | Use OpenRouter for browser access |
| LM Studio | ⚠️ * | ✅ | Local server — see notes below |
| Ollama | ⚠️ * | ✅ | Local server — see notes below |

\* When using the hosted version with a **local** model server (Ollama / LM Studio), browsers block the mixed `https://` → `http://localhost` request. Workarounds:
- Use the offline / local instructions above (serve the file via `python3 -m http.server`)
- Or download the HTML file and open it directly (`file://` works once you set `OLLAMA_ORIGINS="*"` and restart Ollama)

## Tech

Single, self-contained HTML file. No build step, no dependencies to install — D3.js is loaded from a CDN. ~370 KB total.

## License

Personal / educational use. Cisco product names, descriptions, and trademarks are property of Cisco Systems, Inc.
