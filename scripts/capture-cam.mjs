import { chromium } from "playwright";
import fs from "node:fs";

const port = process.env.CITYCUT_PORT ?? "5173";
const out = process.argv[2];
const lat = process.argv[3];
const lon = process.argv[4];
const km = process.argv[5] ?? "1";
const cam = process.argv[6];
if (!out || lat == null || lon == null) {
  throw new Error("usage: capture-cam.mjs <out.png> <lat> <lon> [km] [cam=px,py,pz,tx,ty,tz]");
}

fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
const params = new URLSearchParams({ lat, lon, km });
if (cam) params.set("cam", cam.replace(/^cam=/, ""));
const url = `http://127.0.0.1:${port}/citycut-export/?${params.toString()}`;
console.log(url);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(240_000);
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 240_000 });
const perspective = page.getByRole("button", { name: "Perspective" });
if (await perspective.isVisible()) await perspective.click();
const collapse = page.getByRole("button", { name: /^Collapse / });
if (await collapse.isVisible()) await collapse.click();
await page.locator(".viewport canvas").waitFor({ state: "visible" });
await page.waitForTimeout(6000);
if (cam) {
  await page.waitForFunction(() => typeof window.citycutCamera === "function", null, { timeout: 30_000 });
  const applied = await page.evaluate(() => window.citycutCamera?.());
  console.log("citycutCamera", applied);
}
await page.waitForTimeout(2000);
await page.locator(".viewport canvas").screenshot({ path: out });
await browser.close();
console.log(JSON.stringify({ out, url, port }));
