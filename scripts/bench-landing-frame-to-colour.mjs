/**
 * Landing frame → use-colour fill timing (mean of 5).
 * Usage: node scripts/bench-landing-frame-to-colour.mjs [pr|main] [east|hawthorn]
 *   pr   — skip live refine when tiles cover the cut (default PR behaviour)
 *   main — force live refine (`forceLiveRefine=1`) for before/after comparison
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const label = process.argv[2] ?? "pr";
const site = process.argv[3] ?? "east";
const forceLiveRefine = label === "main";
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";

const sites = {
  east: { lat: -37.8127, lon: 144.98061, km: 1 },
  hawthorn: { lat: -37.8226, lon: 145.0354, km: 1 },
};
const { lat, lon, km } = sites[site] ?? sites.east;
const qs = new URLSearchParams({
  lat: String(lat),
  lon: String(lon),
  km: String(km),
  qa: "1",
});
if (forceLiveRefine) qs.set("forceLiveRefine", "1");
const url = `${base}?${qs.toString()}`;

const SWIFT = [
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
];

const browser = await chromium.launch({ headless: true, args: SWIFT });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  window.localStorage.clear();
});

const runs = [];
for (let i = 0; i < 5; i++) {
  const page = await context.newPage();
  const navT0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () =>
      window.__citycutCutColourStats?.frameFirstDrawnMs != null &&
      window.__citycutCutColourStats?.colourFillMs != null,
    undefined,
    { timeout: 120_000 },
  );
  const stats = await page.evaluate(() => {
    const s = window.__citycutCutColourStats ?? {};
    const frame = s.frameFirstDrawnMs ?? 0;
    const fill = s.colourFillMs ?? 0;
    return {
      ...s,
      frameToColourMs: frame && fill ? Math.round(fill - frame) : null,
    };
  });
  runs.push({ navigationMs: Date.now() - navT0, ...stats });
  await page.close();
}

await context.close();
await browser.close();

function mean(key) {
  const nums = runs.map((r) => r[key]).filter((n) => typeof n === "number");
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

const summary = {
  label,
  site,
  forceLiveRefine,
  url,
  runs,
  meanFrameToColourMs: mean("frameToColourMs"),
  meanColourFetchMs: mean("colourFetchMs"),
  meanColourEnrichmentMs: mean("colourEnrichmentMs"),
  meanColourRefineMs: mean("colourRefineMs"),
  meanNavigationMs: mean("navigationMs"),
};

const file = `${outDir}/bench-landing-frame-to-colour-${label}-${site}.json`;
writeFileSync(file, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
