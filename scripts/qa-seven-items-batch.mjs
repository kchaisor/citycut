/**
 * QA screenshots for seven-item batch. Run after preview on 4173.
 * npx vite-node scripts/qa-seven-items-batch.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`${base}?qa=1&lat=-37.8136&lon=144.9631&km=1`, { waitUntil: "networkidle", timeout: 120_000 });
await page.getByRole("button", { name: "Layers", exact: true }).click();
await page.getByRole("button", { name: "Circle", exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/qa-landing-circle-dashed-toggle.png`, fullPage: false });

const albert = `${base}?qa=1&view=persp&lat=-37.8455&lon=144.9706&km=1.5&shape=circle`;
await page.goto(albert, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 120_000 });
await page.evaluate(() => {
  window.__citycutQa?.setCamera({
    eye: { x: 520, y: 180, z: 420 },
    target: { x: 0, y: 8, z: 0 },
  });
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/qa-albert-park-circle-water.png`, fullPage: false });

await browser.close();
