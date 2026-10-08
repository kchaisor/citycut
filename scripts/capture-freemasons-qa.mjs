import { chromium } from "playwright";
import fs from "node:fs";

const out = process.argv[2] ?? "/opt/cursor/artifacts/freemasons-pr.png";
const lat = "-37.8127";
const lon = "144.98061";
const km = "1";
const label = "East+Melbourne+VIC";

fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const url = `${base}?lat=${lat}&lon=${lon}&km=${km}&label=${label}&qa=1`;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(240_000);
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 240_000 });
await page.waitForTimeout(8000);

await page.evaluate(() => {
  const api = window.__citycutQaModel;
  if (!api?.listBuildings) return;
  const list = api.listBuildings();
  const target = list.find((b) => b.id === 551928359) ?? list.sort((a, z) => z.height - a.height)[0];
  if (target) api.selectHeightEditBuilding(target.id);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(JSON.stringify({ out, url }));
