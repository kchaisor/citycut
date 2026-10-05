/**
 * MCG 1 km metrics (window.__citycutRoadMetrics) + freeway screenshots.
 * Usage: CITYCUT_PORT=5173 node scripts/mcg-metrics-and-capture.mjs before|after
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";

const mode = process.argv[2] ?? "after";
const port = process.env.CITYCUT_PORT ?? "5173";
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const center = { lat: -37.8235, lon: 144.988 };
const km = 1;
const url = `http://127.0.0.1:${port}/citycut-export/?lat=${center.lat}&lon=${center.lon}&km=${km}`;

const targetLat = -37.824;
const targetLon = 144.986;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(240_000);

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 240_000 });
const drawingOpen = page.locator("#model-drawer .drawer-section").filter({ hasText: "Drawing type" });
if (await drawingOpen.isVisible()) {
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
}
const perspective = page.getByRole("button", { name: "Perspective" });
if (await perspective.isVisible()) await perspective.click();
await page.locator(".viewport canvas").waitFor({ state: "visible" });
await page.waitForTimeout(8000);
await page.waitForFunction(() => typeof window.__citycutRoadMetrics === "function", null, { timeout: 120_000 });
await page.waitForFunction(() => typeof window.citycutCamera?.set === "function", null, { timeout: 30_000 });

const metrics = await page.evaluate(() => window.__citycutRoadMetrics?.());
if (!metrics) throw new Error("road metrics missing");

const poses = await page.evaluate(
  ({ targetLat, targetLon, centerLat, centerLon }) => {
    const mPerDegLat = 111132;
    const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
    const targetEast = (targetLon - centerLon) * mPerDegLon;
    const targetNorth = (targetLat - centerLat) * mPerDegLat;
    const main = {
      position: [400, 180, -targetNorth],
      target: [targetEast, 12, -targetNorth],
      near: 2.5,
      far: 40000,
    };
    const close = {
      position: [targetEast + 120, 45, -targetNorth + 40],
      target: [targetEast, 8, -targetNorth],
      near: 1,
      far: 20000,
    };
    return { main, close, targetEast, targetNorth };
  },
  { targetLat, targetLon, centerLat: center.lat, centerLon: center.lon },
);

async function setCam(pose) {
  await page.evaluate((p) => window.citycutCamera?.set(p), pose);
}

const mainPath = `${outDir}/3d-freeway-${mode}.png`;
const closePath = `${outDir}/3d-freeway-close-${mode}.png`;

await setCam(poses.main);
await page.waitForTimeout(2000);
await page.locator(".viewport canvas").screenshot({ path: mainPath });

await setCam(poses.close);
await page.waitForTimeout(2000);
await page.locator(".viewport canvas").screenshot({ path: closePath });

const cam = await page.evaluate(() => window.citycutCamera?.get());

await browser.close();

const hash = (path) => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex").slice(0, 16);

const out = { mode, port, metrics, cam, poses, screenshotHash: { main: hash(mainPath), close: hash(closePath) } };
fs.writeFileSync(`${outDir}/mcg-road-metrics-${mode}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
