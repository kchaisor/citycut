/** QA for PR60 blockers: site plan trees + axo stack at 400 m and 1000 m. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";

function setGap(page, metres) {
  return page.locator('label.scale-field:has-text("Layer gap") input[type="range"]').evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, metres);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${base}?qa=1&view=persp&lat=-37.81313&lon=144.98122&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForTimeout(120_000);
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/qa-site-plan-fitzroy-outlines-trees.png`, fullPage: false });
const planSvg = page.getByRole("img", { name: "Vector site plan" });
const planBox = await planSvg.boundingBox();
if (planBox) {
  await page.screenshot({
    path: `${outDir}/qa-site-plan-fitzroy-trees-crop.png`,
    clip: {
      x: planBox.x + planBox.width * 0.15,
      y: planBox.y + planBox.height * 0.1,
      width: planBox.width * 0.7,
      height: planBox.height * 0.75,
    },
  });
}

await page.getByRole("button", { name: "Exploded axo", exact: true }).click();
for (const label of ["FLOODPLAIN", "ROADS", "GREEN SPACES", "TREES"]) {
  await page.locator(".axo-layer-list label.check-field").filter({ hasText: label }).locator("input").check();
}
await setGap(page, 400);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/qa-exploded-axo-gap-400m-full-stack.png`, fullPage: false });

await setGap(page, 1000);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/qa-exploded-axo-gap-1000m-full-stack.png`, fullPage: false });
const axoSvg = page.getByRole("img", { name: "Exploded axonometric drawing" });
const axoBox = await axoSvg.boundingBox();
if (axoBox) {
  await page.screenshot({
    path: `${outDir}/qa-exploded-axo-labels-crop-2x.png`,
    clip: {
      x: axoBox.x + axoBox.width * 0.08,
      y: axoBox.y + axoBox.height * 0.05,
      width: axoBox.width * 0.55,
      height: axoBox.height * 0.9,
    },
  });
}

await browser.close();
console.log("Blocker QA saved to", outDir);
