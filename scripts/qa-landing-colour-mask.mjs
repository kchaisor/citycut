/**
 * Landing colour mask QA (preview on 4173).
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
  await page.waitForFunction(() => (window.__citycutCutColourStats?.layerRebuilds ?? 0) >= 1, undefined, {
    timeout: 90_000,
  });
  await page.waitForTimeout(1500);
}

/** Start position: Yarra + Southbank. */
await page.goto(`${base}?qa=1&lat=-37.8202&lon=144.9678&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await waitForColour();
await page.screenshot({ path: `${outDir}/landing-colour-yarra-pos1-v2.png` });

/** Far pan within the same viewport tile cache — colour while still dragging (no moveend refetch). */
const canvas = page.locator(".map-canvas");
const box = await canvas.boundingBox();
if (box) {
  const sx = box.x + box.width * 0.55;
  const sy = box.y + box.height * 0.55;
  await page.evaluate(() => {
    window.__citycutCutColourStats = { maskSetData: 0, colourSetData: 0, layerRebuilds: 0 };
  });
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 280, sy - 120, { steps: 18 });
  await page.screenshot({ path: `${outDir}/landing-colour-mid-drag-no-refetch-v2.png` });
  const midStats = await page.evaluate(() => ({ ...window.__citycutCutColourStats }));
  await page.mouse.up();
  await page.waitForTimeout(400);
  console.log("mid-drag stats (expect 0 layer rebuilds, 0 colour setData):", midStats);
}

await page.screenshot({ path: `${outDir}/landing-colour-yarra-pos2-v2.png` });

/** Circle frame — streets must remain visible outside the hole. */
await page.goto(`${base}?qa=1&lat=-37.8202&lon=144.9678&km=0.5&shape=circle`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await waitForColour();
await page.screenshot({ path: `${outDir}/landing-colour-circle-frame-v2.png` });

await browser.close();
console.log("Wrote landing colour QA shots to", outDir);
