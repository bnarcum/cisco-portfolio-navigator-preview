#!/usr/bin/env node
/** Kiosk mode — attract screen + touch entry flags on main app. */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => errors.push(`attract pageerror: ${e.message}`));

  await page.goto(`file://${path.join(root, "kiosk.html")}`, { waitUntil: "load", timeout: 30000 });
  const title = await page.title();
  if (!/Kiosk/i.test(title)) errors.push(`kiosk.html title unexpected: ${title}`);

  const pillars = await page.locator(".kiosk-pillar").count();
  if (pillars !== 3) errors.push(`expected 3 pillar tiles, got ${pillars}`);

  const wpHref = await page.locator('.kiosk-pillar[data-pillar="workplaces"]').getAttribute("href");
  if (!wpHref?.includes("mode=kiosk") || !wpHref.includes("pillar=workplaces")) {
    errors.push(`workplaces link missing kiosk params: ${wpHref}`);
  }

  const appPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  appPage.on("pageerror", e => errors.push(`app pageerror: ${e.message}`));
  await appPage.goto(`file://${path.join(root, "cisco-portfolio-navigator.html")}?mode=kiosk&pillar=workplaces`, {
    waitUntil: "load",
    timeout: 60000
  });
  await appPage.waitForFunction(() => window.__cpnV2?.APP_VERSION, { timeout: 60000 });

  const flags = await appPage.evaluate(() => ({
    kiosk: !!window.__CPN_KIOSK_MODE,
    room: !!window.__CPN_ROOM_MODE,
    kioskClass: document.documentElement.classList.contains("cpn-kiosk-mode"),
    homeFab: !!document.getElementById("kiosk-home-fab"),
    guidedHidden: getComputedStyle(document.getElementById("guided-btn")).display === "none",
    spatialHidden: getComputedStyle(document.querySelector('#vm-seg [data-vm="spatial"]')).display === "none"
  }));

  if (!flags.kiosk) errors.push("__CPN_KIOSK_MODE not set");
  if (!flags.room) errors.push("kiosk should enable room perf (__CPN_ROOM_MODE)");
  if (!flags.kioskClass) errors.push("cpn-kiosk-mode class missing");
  if (!flags.homeFab) errors.push("kiosk home FAB missing");
  if (!flags.guidedHidden) errors.push("guided plan should be hidden in kiosk");
  if (!flags.spatialHidden) errors.push("spatial view should be hidden in kiosk");

  await appPage.waitForSelector('#vm-seg [data-vm="families"].active', { timeout: 15000 });

  const boot = await appPage.evaluate(() => {
    const activePillar = document.querySelector("#ppills .pp.active[data-pillar]")?.dataset.pillar || null;
    return {
      familiesActive: !!document.querySelector('#vm-seg [data-vm="families"].active'),
      activePillar
    };
  });
  if (!boot.familiesActive) errors.push("families tab should be active for pillar=workplaces");
  if (boot.activePillar !== "workplaces") errors.push(`expected workplaces pillar focus, got ${boot.activePillar}`);

  if (errors.length) {
    console.error("FAIL test-kiosk-mode:");
    errors.forEach(e => console.error(" -", e));
    process.exit(1);
  }
  console.log("OK test-kiosk-mode");
} finally {
  await browser.close();
}
