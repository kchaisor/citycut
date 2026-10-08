/**
 * Headless Chrome: 2 km Melbourne CBD create-model timing and memory.
 * Run after `npm run build && npm run preview` on port 4173.
 * npx vite-node scripts/bench-2km-create.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outPath = "/opt/cursor/artifacts/bench-2km-create.json";
mkdirSync("/opt/cursor/artifacts", { recursive: true });

const base = "http://127.0.0.1:4173/citycut/";
const url = `${base}?qa=1&lat=-37.8136&lon=144.9631&km=2`;

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-precise-memory-info",
    "--js-flags=--expose-gc",
  ],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const client = await context.newCDPSession(page);

let peakHeap = 0;
const sampleHeap = async () => {
  const metrics = await client.send("Performance.getMetrics");
  const heap = metrics.metrics.find((m) => m.name === "JSHeapUsedSize");
  if (heap) peakHeap = Math.max(peakHeap, heap.value);
  const legacy = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  if (legacy) peakHeap = Math.max(peakHeap, legacy);
};

await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await sampleHeap();
const t0 = Date.now();
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForFunction(
  () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 500,
  null,
  { timeout: 600_000 },
);
const readyMs = Date.now() - t0;
await sampleHeap();
const summary = await page.evaluate(() => window.__citycutQaModel?.getSummary?.() ?? null);
await page.evaluate(() => globalThis.gc?.());
await new Promise((r) => setTimeout(r, 2000));
await sampleHeap();
const afterHeap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
const afterCdp = (await client.send("Performance.getMetrics")).metrics.find(
  (m) => m.name === "JSHeapUsedSize",
)?.value;

const report = {
  url,
  wallMsCreateToReady: readyMs,
  peakHeapBytes: peakHeap,
  afterHeapBytes: afterHeap ?? afterCdp ?? null,
  buildingCount: summary?.buildingCount ?? null,
  roadCount: summary?.roadCount ?? null,
  triangleCount: summary?.triangleCount ?? null,
};

writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
