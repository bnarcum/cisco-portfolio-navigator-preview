import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const docs = path.join(root, "docs");
const url = "https://bnarcum.github.io/cisco-portfolio-navigator/";

await mkdir(docs, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  localStorage.setItem("cisco-portfolio-tour-completed-v1", "1");
  localStorage.setItem("cisco-portfolio-tour-latest-seen", "v2.4");
  localStorage.setItem("cpn-changelog-v2", JSON.stringify("2.6.1"));
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// Dismiss tour/changelog if still visible
await page.locator(".tp-btn.skip").click({ timeout: 2000 }).catch(() => {});
await page.locator("#cl-x").click({ timeout: 1000 }).catch(() => {});
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// Open Account Planner
await page.click("#planner-btn", { force: true });
await page.waitForTimeout(1500);

await page.screenshot({ path: path.join(docs, "hero.png"), fullPage: false });

// Social preview crop: top bar + graph + planner edge (1280x640 from top-left)
await page.screenshot({
  path: path.join(docs, "social-preview.png"),
  clip: { x: 0, y: 0, width: 1280, height: 640 },
});

await browser.close();
console.log("Saved docs/hero.png and docs/social-preview.png");
