/**
 * QA shots for blank-page safety + building-only landing preview.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const previewBase = "http://127.0.0.1:4173/citycut/";
const devBase = "http://127.0.0.1:5173/citycut/";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

async function waitForLandingColour(page) {
  await page.waitForFunction(() => (window.__citycutCutColourStats?.layerRebuilds ?? 0) >= 1, undefined, {
    timeout: 120_000,
  });
  await page.waitForTimeout(1200);
}

{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${devBase}?qa=crash`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".app-fatal", { timeout: 15_000 });
  await page.screenshot({ path: `${outDir}/app-fatal-boundary-qa-crash.png`, fullPage: true });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${previewBase}?qa=1&lat=-37.8202&lon=144.9678&km=0.5`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await waitForLandingColour(page);
  await page.screenshot({ path: `${outDir}/landing-building-only-yarra-southbank.png` });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${previewBase}?qa=1&lat=-37.8136&lon=144.9831&km=1`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page.getByRole("button", { name: /^Create model$/ }).click();
  await page.waitForSelector(".model .viewport canvas, .model .viewport .scene-viewport", {
    timeout: 180_000,
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${outDir}/model-east-melbourne-after-create.png` });
  await page.close();
}

await browser.close();
console.log("Wrote QA shots to", outDir);
