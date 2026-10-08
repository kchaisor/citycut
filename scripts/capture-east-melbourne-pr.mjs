import { chromium } from "playwright";

const url = "http://127.0.0.1:4173/citycut/?lat=-37.8127&lon=144.98061&km=1";
const out = "/opt/cursor/artifacts/east-melbourne-blocks-pr.png";

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.waitForTimeout(5000);
const drawing = page.locator('button[aria-label="Drawing"], button:has-text("Drawing")').first();
if (await drawing.count()) {
  await drawing.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log("Saved", out);
