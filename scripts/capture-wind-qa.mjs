/**
 * QA wind + uniform + dash-dot screenshots for Mont Albert frame.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const baseUrl =
  "http://127.0.0.1:5173/citycut-export/?qa=1&buildings=uniform&lat=-37.8207&lon=145.1053&km=0.4&label=Mont%20Albert";

function cameraPose() {
  const target = { x: 0, y: 6, z: 0 };
  return {
    eye: { x: -280, y: 220, z: -280 },
    look: target,
  };
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300_000);

await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(3000);
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.waitForTimeout(6000);

await page.getByRole("button", { name: "Buildings", exact: true }).click();
await page.getByRole("button", { name: "Uniform colour", exact: true }).click().catch(() => {});
await page.getByRole("button", { name: "Summary", exact: true }).click().catch(() => {});

await page.getByRole("button", { name: "Wind", exact: true }).click();
await page.getByLabel("Wind on").check();
await page.waitForTimeout(20000);

await page.getByRole("button", { name: "Trees", exact: true }).click().catch(() => {});

await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 60_000 });
const pose = cameraPose();
await page.evaluate((p) => {
  window.__citycutQa?.setCamera({ eye: p.eye, target: p.look });
}, pose);
await page.waitForTimeout(3000);

await page.screenshot({ path: `${outDir}/wind-annual-3d.png` });

await page.selectOption("select", "winter");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/wind-winter-3d.png` });

await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("tab", { name: "Drawing" }).click();
await page.waitForSelector(".fill.is-plan svg", { timeout: 60_000 });
await page.getByRole("button", { name: "Drawing", exact: true }).click();
const scaleSelect = page.locator(".drawer-section:not([hidden]) select").first();
if (await scaleSelect.count()) {
  await scaleSelect.selectOption("1000");
}
await page.waitForTimeout(1500);
await page.locator(".fill.is-plan svg").screenshot({ path: `${outDir}/plan-uniform-dashdot.png` });

await browser.close();
console.log("saved wind QA screenshots to", outDir);
