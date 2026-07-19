#!/usr/bin/env node
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = path.join(root, "cisco-portfolio-navigator.html");
const errors = [];
const browser = await chromium.launch();

async function openRefreshTimeline(page) {
  await page.goto(`file://${html}`);
  await page.waitForFunction(() => window.CPN_RefreshTimeline?.render);
  await page.evaluate(() => window.CPN_RefreshTimeline.open());
  await page.waitForSelector("#tl-wrap.show");
}

try {
  const page = await browser.newPage();

  await openRefreshTimeline(page);

  for (const id of ["#tl-viewport-flow", "#tl-minimap", "#tl-stats-ticker", "#tl-readout", "#tl-layer-decades"]) {
    if (!(await page.locator(id).count())) errors.push(`missing ${id}`);
  }

  const helpFabVisible = await page.evaluate(() => {
    const fab = document.querySelector("#help-fab");
    return fab && getComputedStyle(fab).display !== "none";
  });
  if (helpFabVisible) errors.push("help-fab should be hidden when refresh timeline is open");

  const toolsVisible = await page.evaluate(() => {
    const tools = document.querySelector("#tools");
    return tools && getComputedStyle(tools).display !== "none";
  });
  if (toolsVisible) errors.push("tools bar should be hidden when refresh timeline is open");

  const tickerText = await page.locator("#tl-stats-ticker").innerText();
  if (!/Showing \d+ product/.test(tickerText)) errors.push(`unexpected stats ticker: ${tickerText}`);
  const eolMatch = tickerText.match(/(\d+)\s+EOL/);
  const eosMatch = tickerText.match(/(\d+)\s+EOS/);
  if (!eolMatch || Number(eolMatch[1]) < 1) errors.push(`expected EOL products in ticker, got: ${tickerText}`);
  if (!eosMatch || Number(eosMatch[1]) < 1) errors.push(`expected EOS products in ticker, got: ${tickerText}`);

  const startYear = await page.locator("#tl-minimap-labels span").first().innerText();
  if (Number(startYear) > 2015) errors.push(`timeline start year too recent: ${startYear}`);

  const blockCount = await page.locator(".tl-block").count();
  if (blockCount < 10) errors.push(`expected many product bars, got ${blockCount}`);

  await page.locator(".tl-block").first().hover();
  await page.waitForFunction(() => !document.querySelector("#tl-readout")?.hidden);
  const readoutName = await page.locator("#tl-readout-name").innerText();
  if (!readoutName) errors.push("readout name empty after hover");

  await page.locator(".tl-block").first().click();
  await page.waitForTimeout(200);
  const panelOpen = await page.evaluate(() => document.querySelector("#panel")?.classList.contains("open"));
  if (!panelOpen) errors.push("panel should open on product bar click");

  await page.locator(".tl-axis").click({ position: { x: 40, y: 12 } });
  await page.waitForTimeout(150);
  const panelClosed = await page.evaluate(() => !document.querySelector("#panel")?.classList.contains("open"));
  if (!panelClosed) errors.push("panel should close on canvas background click");

  const outcomeVisible = await page.evaluate(() =>
    window.__cpnOutcomeCard?.isVisible?.() === true
  );
  if (outcomeVisible) errors.push("outcome card should not open from timeline product click");
  await page.evaluate(() => window.closePanel?.());
  await page.waitForTimeout(100);

  const beforeScroll = await page.evaluate(() => {
    const canvas = document.querySelector("#tl-canvas");
    return { left: canvas.scrollLeft, canScroll: canvas.scrollWidth > canvas.clientWidth + 4 };
  });
  if (beforeScroll.canScroll) {
    await page.evaluate(() => {
      const canvas = document.querySelector("#tl-canvas");
      canvas.scrollLeft = Math.min(canvas.scrollWidth, canvas.scrollLeft + 200);
      canvas.dispatchEvent(new Event("scroll"));
    });
    const afterScroll = await page.evaluate(() => document.querySelector("#tl-canvas").scrollLeft);
    if (afterScroll <= beforeScroll.left) errors.push("canvas did not scroll horizontally");

    const scrollResult = await page.evaluate(async () => {
      const vp = document.querySelector("#tl-minimap-viewport");
      const canvas = document.querySelector("#tl-canvas");
      const left1 = vp?.style.left || "";
      const prev = canvas.scrollLeft;
      canvas.scrollLeft = Math.min(canvas.scrollWidth - canvas.clientWidth, prev + 120);
      canvas.dispatchEvent(new Event("scroll"));
      await new Promise(r => requestAnimationFrame(r));
      return {
        scrolled: canvas.scrollLeft > prev,
        vpChanged: left1 !== (vp?.style.left || ""),
      };
    });
    if (scrollResult.scrolled && !scrollResult.vpChanged) {
      errors.push("minimap viewport did not update on scroll");
    }
  } else {
    await page.evaluate(() => window.CPN_RefreshTimeline.setZoom(2.5));
    await page.waitForTimeout(150);
    const canScrollNow = await page.evaluate(() => {
      const canvas = document.querySelector("#tl-canvas");
      return canvas.scrollWidth > canvas.clientWidth + 4;
    });
    if (!canScrollNow) errors.push("expected horizontal scroll after zoom in");
  }

  await page.locator("#tl-minimap-track").click({ position: { x: 20, y: 14 } });
  await page.waitForTimeout(80);

  const build = await page.evaluate(() => window.__CPN_BUILD);
  if (!build || !String(build).startsWith("3.5")) errors.push(`expected build 3.5.x, got ${build}`);

  const beforeFilter = await page.locator(".tl-row").count();

  await page.locator("#tl-cat-btn").click();
  await page.locator('.tl-cat-opt[data-cat="security"]').click();
  await page.waitForTimeout(100);

  const securityFilter = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".tl-row .tl-row-lbl .nm")].map(el => el.textContent.trim());
    const categories = rows.map(name => {
      const node = Object.values(window.nodeById || {}).find(n => n.name === name);
      return node?.category;
    });
    return { rowCount: rows.length, categories, btn: document.querySelector("#tl-cat-btn")?.textContent?.trim() };
  });
  if (securityFilter.rowCount >= beforeFilter) {
    errors.push(`security filter should reduce rows (${securityFilter.rowCount} vs ${beforeFilter})`);
  }
  if (securityFilter.categories.some(c => c && c !== "security")) {
    errors.push("filtered rows should all be Security portfolio families");
  }
  if (!securityFilter.btn?.includes("Security")) {
    errors.push(`cat button should show Security, got ${securityFilter.btn}`);
  }

  await page.evaluate(() => window.CPN_RefreshTimeline.close());
  await page.waitForFunction(() => !document.querySelector("#tl-wrap.show"));

  await page.evaluate(() => window.CPN_RefreshTimeline.open());
  await page.waitForSelector("#tl-wrap.show");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#tl-wrap.show"));
  const closedByEsc = await page.evaluate(() => !document.querySelector("#tl-wrap.show"));
  if (!closedByEsc) errors.push("Escape should close Refresh Timeline");
} catch (err) {
  errors.push(err.message);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error("Refresh timeline tests FAILED:");
  errors.forEach(e => console.error(" -", e));
  process.exit(1);
}
console.log("Refresh timeline tests passed");
