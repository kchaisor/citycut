// Usage: node scripts/qa-massing-click-parcels.mjs <baseUrl> <outDir>
// Headless check of click-click massing drawing + parcel outlines, with screenshots.
import { chromium } from "playwright";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const outDir = process.argv[3] ?? "/workspace";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage", "--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  window.__citycutVerifyHarness = true;
});
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: path.join(outDir, name) });
const result = {};
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector("button.create-fab", { timeout: 60_000 });
await page.click("button.create-fab");
await page.waitForFunction(() => window.__citycutQaMassing?.enableTool != null, null, { timeout: 180_000 });
await page.waitForTimeout(6000);
await page.evaluate(() => {
  for (const k of Object.keys(localStorage)) if (k.startsWith("citycut.massingBlocks.")) localStorage.removeItem(k);
});
await page
  .waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-intro-progress-pct") === "100", null, { timeout: 60_000 })
  .catch(() => {});
await page.waitForTimeout(1500);
await shot("qa-before-massing-off.png");
await page.click('button[aria-label="Massing draw tool"]');
await page
  .waitForFunction(() => window.__citycutQaParcels && window.__citycutQaParcels.status !== "loading", null, { timeout: 60_000 })
  .catch(() => {});
await page.waitForTimeout(800);
result.parcels = await page.evaluate(() => window.__citycutQaParcels ?? null);
await shot("qa-massing-on-parcels.png");
result.blocksBefore = await page.evaluate(() => window.__citycutQaMassing?.getBlocks()?.length ?? -1);
await page.mouse.click(560, 430);
await page.waitForTimeout(250);
await page.mouse.move(720, 430, { steps: 12 });
await page.waitForTimeout(400);
result.preview = await page.evaluate(() => window.__citycutQaMassingPreview ?? null);
result.hud = await page.evaluate(() => document.querySelector(".massing-cursor-pill")?.textContent ?? "");
result.blocksDuringPreview = await page.evaluate(() => window.__citycutQaMassing?.getBlocks()?.length ?? -1);
await shot("qa-click-preview.png");
await page.mouse.click(720, 430);
await page.waitForTimeout(600);
result.blocksAfter = await page.evaluate(() => (window.__citycutQaMassing?.getBlocks() ?? []).map((b) => ({ w: b.width_m, cl: b.centerline })));
await shot("qa-click-committed.png");
// Escape cancel
await page.keyboard.press("Escape");
await page.mouse.click(560, 560);
await page.waitForTimeout(150);
await page.mouse.click(560, 560);
await page.waitForTimeout(150);
await page.mouse.move(700, 560, { steps: 8 });
await page.waitForTimeout(250);
const escBefore = await page.evaluate(() => window.__citycutQaMassingPreview?.phase ?? null);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
result.escape = {
  before: escBefore,
  after: await page.evaluate(() => window.__citycutQaMassingPreview ?? null),
  blocks: await page.evaluate(() => window.__citycutQaMassing?.getBlocks()?.length ?? -1),
};
const persp = page.getByRole("button", { name: "Perspective", exact: true });
if (await persp.count()) await persp.first().click();
await page.waitForTimeout(1500);
await shot("qa-after-perspective-parcels.png");
const planBtn = page.getByRole("button", { name: "Plan", exact: true });
if (await planBtn.count()) await planBtn.first().click({ force: true });
await page.waitForTimeout(2500);
await shot("qa-plan-parcels.png");
result.parcelsAfterViewChange = await page.evaluate(() => window.__citycutQaParcels ?? null);
console.log(JSON.stringify(result, null, 1));
await browser.close();
