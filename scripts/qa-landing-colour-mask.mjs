/**
 * Landing colour mask QA screenshots (preview on 4173).
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

async function waitForColour() {
  await page.waitForTimeout(12_000);
}

/** Yarra + park inside frame. */
await page.goto(`${base}?qa=1&lat=-37.8202&lon=144.9678&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await waitForColour();
await page.screenshot({ path: `${outDir}/landing-colour-yarra-pos1.png` });

/** Second position still showing Yarra edge. */
await page.goto(`${base}?qa=1&lat=-37.8175&lon=144.9655&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await waitForColour();
await page.screenshot({ path: `${outDir}/landing-colour-yarra-pos2.png` });

/** Circle frame over Southbank / Yarra. */
await page.goto(`${base}?qa=1&lat=-37.8202&lon=144.9678&km=0.5&shape=circle`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await waitForColour();
await page.screenshot({ path: `${outDir}/landing-colour-circle-frame.png` });

await browser.close();
console.log("Wrote landing colour QA shots to", outDir);
