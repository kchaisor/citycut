import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("/opt/cursor/artifacts", { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${base}?qa=1&lat=-37.8136&lon=144.9831&km=1`, { waitUntil: "networkidle", timeout: 180_000 });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForFunction(
  () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 20,
  null,
  { timeout: 600_000 },
);
const snapshot = await page.evaluate(() => window.__citycutQaModel?.exportPlanSnapshot?.() ?? null);
if (snapshot) writeFileSync("/opt/cursor/artifacts/east-model.json", JSON.stringify(snapshot));
await browser.close();
console.log("captured east-model.json", Boolean(snapshot));
