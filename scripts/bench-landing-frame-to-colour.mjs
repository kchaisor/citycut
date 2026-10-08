/**
 * East Melbourne 1 km: time from cut frame drawn → use-colour fill idle, with fetch breakdown.
 * Run with `npm run preview` on 4173. Optional argv: `main` (CoM heights off) or `pr` (default, on).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const label = process.argv[2] ?? "pr";
const comOff = label === "main";
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const url = `${base}?lat=-37.8127&lon=144.98061&km=1&qa=1`;

const SWIFT = [
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
];

const browser = await chromium.launch({ headless: true, args: SWIFT });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript((off) => {
  window.localStorage.clear();
  if (off) window.localStorage.setItem("citycut.comBuildingHeights", "false");
}, comOff);

const runs = [];
for (let i = 0; i < 3; i++) {
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
  comBuildingHeights: !comOff,
  runs,
  meanFrameToColourMs: mean("frameToColourMs"),
  meanColourFetchMs: mean("colourFetchMs"),
  meanColourEnrichmentMs: mean("colourEnrichmentMs"),
  meanColourRefineMs: mean("colourRefineMs"),
  meanNavigationMs: mean("navigationMs"),
};

writeFileSync(`${outDir}/bench-landing-frame-to-colour-${label}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
