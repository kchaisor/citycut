import { chromium } from "playwright";

const outDir = "/opt/cursor/artifacts";
const baseUrl =
  "http://127.0.0.1:5173/citycut/?qa=1&buildings=uniform&lat=-37.8207&lon=145.1053&km=0.4&label=Mont%20Albert";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300_000);
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.waitForTimeout(5000);
await page.getByRole("button", { name: "Wind", exact: true }).click();
await page.getByLabel("Wind on").check();
await page.waitForTimeout(15000);
await page.locator(".wind-drawer select").selectOption("winter");
await page.waitForTimeout(3000);
await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 60_000 });
await page.evaluate(() => {
  window.__citycutQa?.setCamera({ eye: { x: -280, y: 220, z: -280 }, target: { x: 0, y: 6, z: 0 } });
});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/wind-winter-3d.png` });

await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("tab", { name: "Drawing" }).click();
await page.waitForSelector(".fill.is-plan svg");
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.locator(".drawer-section:not([hidden]) select").first().selectOption("1000").catch(() => {});
await page.waitForTimeout(2000);
await page.locator(".fill.is-plan svg").screenshot({ path: `${outDir}/plan-uniform-dashdot.png` });
await browser.close();
console.log("done");
