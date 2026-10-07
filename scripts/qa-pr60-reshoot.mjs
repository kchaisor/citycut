/**
 * QA re-shoot for PR #60 review fixes. Preview on 4173 required.
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

/** Landing: Yarra + park, coloured inside frame. */
await page.goto(`${base}?qa=1&lat=-37.8202&lon=144.9678&km=0.5`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(10_000);
await page.screenshot({ path: `${outDir}/qa-landing-colour-frame.png`, fullPage: false });

/** Site plan Fitzroy 0.5 km + detail crop. */
await page.goto(`${base}?qa=1&view=persp&lat=-37.81313&lon=144.98122&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.getByRole("button", { name: "Layers" }).click();
await page.getByRole("button", { name: "Trees" }).click();
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.getByRole("button", { name: "Model details", exact: true }).click();
await page.waitForTimeout(90_000);
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/qa-site-plan-fitzroy-outlines-trees.png`, fullPage: false });

/** Exploded axo: trees on, gap 1000 m. */
await page.getByRole("button", { name: "Exploded axo", exact: true }).click();
await page.locator(".axo-layer-list label.check-field").filter({ hasText: "TREES" }).locator("input").check();
await page.locator('label.scale-field:has-text("Layer gap") input[type="range"]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, "1000");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/qa-exploded-axo-labels-guides-trees.png`, fullPage: false });
const axoSvg = page.getByRole("img", { name: "Exploded axonometric drawing" });
const axoBox = await axoSvg.boundingBox();
if (axoBox) {
  await page.screenshot({
    path: `${outDir}/qa-exploded-axo-labels-crop-2x.png`,
    clip: {
      x: axoBox.x + axoBox.width * 0.52,
      y: axoBox.y + axoBox.height * 0.08,
      width: axoBox.width * 0.42,
      height: axoBox.height * 0.88,
    },
  });
}

await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.getByRole("button", { name: "Collapse Drawing" }).click().catch(() => {});
await page.waitForTimeout(300);
await page.locator(".viewport.is-drawing").hover({ position: { x: 400, y: 450 } });
for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -400);
await page.waitForTimeout(1000);
const planSvg = page.getByRole("img", { name: "Vector site plan" });
const planSvgBox = await planSvg.boundingBox();
if (planSvgBox) {
  await page.screenshot({
    path: `${outDir}/qa-site-plan-fitzroy-detail-crop.png`,
    clip: {
      x: planSvgBox.x + planSvgBox.width * 0.25,
      y: planSvgBox.y + planSvgBox.height * 0.2,
      width: planSvgBox.width * 0.5,
      height: planSvgBox.height * 0.55,
    },
  });
}

/** Popup: Collins / Swanston CLUE + address. */
await page.goto(`${base}?qa=1&view=persp&lat=-37.8136&lon=144.9631&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForFunction(() => window.__citycutQaModel?.pickBuildingNearGeoQa != null, null, { timeout: 120_000 });
await page.evaluate(() => {
  window.__citycutQa?.setCamera?.({
    eye: { x: 280, y: 200, z: 140 },
    target: { x: 20, y: 30, z: -10 },
  });
});
await page.waitForTimeout(600);
await page.evaluate(() => window.__citycutQaModel?.pickBuildingNearGeoQa?.(-37.81375, 144.96525));
await page.waitForTimeout(6000);
await page.screenshot({ path: `${outDir}/qa-building-popup-cbd.png`, fullPage: false });

/** Popup with development data (GPO / Bourke). */
await page.evaluate(() => window.__citycutQaModel?.pickBuildingNearGeoQa?.(-37.8136, 144.96329));
await page.waitForTimeout(6000);
await page.screenshot({ path: `${outDir}/qa-building-popup-development.png`, fullPage: false });

await browser.close();
console.log("PR60 QA re-shoot saved to", outDir);
