/**
 * Pan the landing map in steps; record per-step timing and cut-colour layer update counts.
 * Run with preview on 4173. Pass `before` or `after` as argv[2] for the report label.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const label = process.argv[2] ?? "after";
const base = "http://127.0.0.1:4173/citycut/";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${base}?qa=1&lat=-37.8202&lon=144.9678&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.waitForTimeout(14_000);
await page.waitForFunction(() => window.__citycutCutColourStats?.layerRebuilds >= 1, undefined, {
  timeout: 60_000,
}).catch(() => {});

const steps = 20;
const dragPx = 300;
const dx = dragPx / steps;

const box = await page.locator(".map-canvas").boundingBox();
if (!box) throw new Error("no map canvas box");
const startX = box.x + box.width / 2;
const startY = box.y + box.height / 2;

await page.evaluate(() => {
  window.__citycutCutColourStats = { maskSetData: 0, colourSetData: 0, layerRebuilds: 0 };
});

const stepMetrics = [];
await page.mouse.move(startX, startY);
await page.mouse.down();
for (let i = 0; i < steps; i++) {
  const t0 = Date.now();
  const nextX = startX + dx * (i + 1);
  await page.mouse.move(nextX, startY, { steps: 1 });
  await page.waitForTimeout(16);
  const stats = await page.evaluate(() => ({ ...window.__citycutCutColourStats }));
  stepMetrics.push({ ms: Date.now() - t0, stats });
}
await page.mouse.up();

await page.waitForTimeout(3000);
const endStats = await page.evaluate(() => window.__citycutCutColourStats ?? null);

const summary = {
  label,
  steps,
  totalDragPx: dragPx,
  avgStepMs: stepMetrics.reduce((s, m) => s + m.ms, 0) / steps,
  maxStepMs: Math.max(...stepMetrics.map((m) => m.ms)),
  totalMaskSetDataDuringDrag: stepMetrics.at(-1)?.stats.maskSetData ?? 0,
  totalColourSetDataDuringDrag: stepMetrics.at(-1)?.stats.colourSetData ?? 0,
  totalLayerRebuildsDuringDrag: stepMetrics.at(-1)?.stats.layerRebuilds ?? 0,
  statsAfterSettle: endStats,
  stepMetrics,
};

writeFileSync(`${outDir}/bench-landing-colour-${label}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

await browser.close();
