/**
 * Hawthorn 1 km: prove live refine vs tiles-only landing colours differ when expected.
 * Requires preview with GM enrichment in public/ (or manifest pointing at test release).
 * Writes PNG + JSON under /opt/cursor/artifacts/.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const lat = -37.8226;
const lon = 145.0354;
const km = 1;

const SWIFT = [
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
];

function sha1File(path) {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

async function captureMode(browser, mode) {
  const tilesOnly = mode === "tiles-only";
  const qs = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    km: String(km),
    qa: "1",
  });
  if (tilesOnly) qs.set("tilesOnly", "1");
  const url = `${base}?${qs.toString()}`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    window.localStorage.clear();
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`[${mode}]`, msg.text());
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForFunction(
    () => window.__citycutCutColourStats?.landingUseTotal != null,
    undefined,
    { timeout: 300_000 },
  );
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => ({ ...window.__citycutCutColourStats }));
  const pngPath = `${outDir}/landing-hawthorn-gm-${mode}.png`;
  await page.screenshot({ path: pngPath, fullPage: false });
  await context.close();
  return { mode, url, pngPath, sha1: sha1File(pngPath), stats };
}

const browser = await chromium.launch({ headless: true, args: SWIFT });
const normal = await captureMode(browser, "normal");
const tilesOnly = await captureMode(browser, "tiles-only");
await browser.close();

const summary = {
  lat,
  lon,
  km,
  normal,
  tilesOnly,
  sha1Match: normal.sha1 === tilesOnly.sha1,
};
writeFileSync(`${outDir}/landing-hawthorn-gm-proof.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
