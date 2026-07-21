#!/usr/bin/env node
/** Pillar focus — centered promise strip + value-prop ribbon docked below the graph (Band A). */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });

  const check = async (pillar, minProps) => {
    await page.evaluate((p) => {
      document.querySelector('[data-vm="families"]')?.click();
      window.applyViewLevel?.("families", { focusPillar: p });
    }, pillar);
    await page.waitForTimeout(900);
    return page.evaluate(() => {
      const strip = document.querySelector(".pillar-promise-strip");
      const ribbon = document.querySelector(".pillar-vp-ribbon");
      const cards = document.querySelectorAll(".pvp-card");
      const stripBottom = strip?.getBoundingClientRect().bottom ?? 0;
      const ribbonTop = ribbon?.getBoundingClientRect().top ?? 0;
      return {
        version: window.__cpnV2?.APP_VERSION,
        strip: !!strip,
        ribbon: !!ribbon,
        cards: cards.length,
        numbered: !!document.querySelector(".pvp-card .pic-num"),
        legacyCard: !!document.querySelector(".pillar-insight-card"),
        pillarFocus: document.body.classList.contains("pillar-focus"),
        ribbonBelowStrip: ribbonTop > stripBottom
      };
    });
  };

  let s = await check("ai-dc", 3);
  if (s.version !== "3.5.22") errors.push(`expected 3.5.22, got ${s.version}`);
  if (!s.pillarFocus) errors.push("expected pillar-focus body class");
  if (!s.strip) errors.push("missing promise strip");
  if (!s.ribbon) errors.push("missing value-prop ribbon");
  if (s.cards < 3) errors.push(`ai-dc: expected >=3 value props, got ${s.cards}`);
  if (s.numbered) errors.push("value-prop cards should not be numbered");
  if (s.legacyCard) errors.push("legacy floating insight card should be gone");
  if (!s.ribbonBelowStrip) errors.push("ribbon should sit below the promise strip");

  // Workplaces has 5 highlights — ribbon must still render them.
  s = await check("workplaces", 5);
  if (s.cards < 5) errors.push(`workplaces: expected >=5 value props, got ${s.cards}`);

  if (errors.length) {
    console.error("FAIL:", errors.join("; "));
    process.exit(1);
  }
  console.log("PASS: pillar context ribbon-below (Band A)");
} finally {
  await browser.close();
}
