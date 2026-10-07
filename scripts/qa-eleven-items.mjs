/**
 * QA screenshots for the eleven-item batch. Run after preview on 4173.
 * npx vite-node scripts/qa-eleven-items.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${base}?qa=1&lat=-37.8136&lon=144.9631&km=0.5`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${outDir}/qa-landing-colour-frame.png`, fullPage: false });

await page.goto(`${base}?qa=1&view=persp&lat=-37.8136&lon=144.9631&km=0.5`, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/qa-site-plan-cbd-outlines-trams.png`, fullPage: false });

await page.getByRole("button", { name: "Exploded axo", exact: true }).click();
await page.getByLabel("TRANSPORT").check().catch(() => {});
await page.getByLabel("TREES").check().catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/qa-exploded-axo-labels-guides-trees.png`, fullPage: false });

await browser.close();
console.log("Saved QA PNGs to", outDir);
