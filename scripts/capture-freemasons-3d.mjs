import { chromium } from "playwright";
import fs from "node:fs";

const out = process.argv[2] ?? "/opt/cursor/artifacts/freemasons-3d-pr.png";
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const url = `${base}?lat=-37.8127&lon=144.98061&km=1&label=East+Melbourne+VIC&qa=1`;

fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300_000);

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.waitForTimeout(25_000);

const comToggle = page.getByRole("button", { name: /CoM 2023/i });
if (await comToggle.count()) {
  const pressed = await comToggle.first().getAttribute("aria-pressed");
  if (pressed !== "true") await comToggle.first().click();
}

await page.getByRole("button", { name: "Buildings", exact: true }).click();
const canvas = page.locator(".viewport canvas");
await canvas.waitFor({ state: "visible" });
const box = await canvas.boundingBox();
if (box) {
  const cx = box.x + box.width * 0.55;
  const cy = box.y + box.height * 0.55;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 180, cy - 120, { steps: 25 });
  await page.mouse.up();
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(200);
  }
}

await page.evaluate(() => {
  const api = window.__citycutQaModel;
  if (!api?.selectHeightEditBuilding) return;
  const list = api.listBuildings?.() ?? [];
  const target = list.find((b) => b.id === 551928359);
  if (target) api.selectHeightEditBuilding(target.id);
});
await page.waitForTimeout(2000);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(JSON.stringify({ out, url }));
