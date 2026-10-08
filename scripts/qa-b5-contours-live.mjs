import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const planClip = { x: 430, y: 56, width: 860, height: 820 };

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(120_000);

await page.goto(`${base}?qa=1&view=persp&lat=-37.8142&lon=144.9848&km=0.35`, {
  waitUntil: "networkidle",
  timeout: 180_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForFunction(
  () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 50,
  null,
  { timeout: 600_000 },
);
await page.waitForFunction(
  () => {
    const el = document.querySelector("[data-contour-lines]");
    return el && Number(el.getAttribute("data-contour-lines")) > 20;
  },
  null,
  { timeout: 180_000 },
);
await page.locator(".model-chrome").getByRole("button", { name: "Drawing", exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForSelector(".fill.is-plan svg.plan:not(.figure-ground)", { timeout: 120_000 });
await page.getByLabel("Plan scale", { exact: true }).selectOption("1000");
await page.waitForTimeout(500);
const svg = page.locator(".fill.is-plan svg.plan");
await svg.click({ position: { x: 400, y: 350 }, force: true });
for (let i = 0; i < 10; i++) {
  await page.keyboard.press("Equal");
  await page.waitForTimeout(80);
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/b5-contours-under-roads.png`, clip: planClip });
await browser.close();
console.log("Contour crop written");
