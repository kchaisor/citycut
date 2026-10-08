/**
 * Compare 2 km create-model wall time: current build vs another ref (set BENCH_GIT_REF=main).
 * npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 * BENCH_GIT_REF=main npx vite-node scripts/bench-2km-compare.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const runs = 3;
const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const url = `${base}?qa=1&lat=-37.8136&lon=144.9631&km=2`;

async function measureOnce() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  const t0 = Date.now();
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForFunction(
    () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 500,
    null,
    { timeout: 600_000 },
  );
  const ms = Date.now() - t0;
  await browser.close();
  return ms;
}

async function runSeries(label) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    samples.push(await measureOnce());
    console.log(`${label} run ${i + 1}: ${samples[i]} ms`);
  }
  const mean = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  return { label, samples, meanMs: mean };
}

const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
const current = await runSeries(branch);

let baseline = null;
const ref = process.env.BENCH_GIT_REF;
if (ref) {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  execSync(`git stash push -u -m bench-tmp -- scripts/bench-2km-compare.mjs 2>/dev/null || true`, { stdio: "inherit" });
  execSync(`git checkout ${ref}`, { stdio: "inherit" });
  execSync("npm run build", { stdio: "inherit" });
  baseline = await runSeries(ref);
  execSync(`git checkout ${head}`, { stdio: "inherit" });
  execSync("git stash pop 2>/dev/null || true", { stdio: "inherit" });
  execSync("npm run build", { stdio: "inherit" });
}

const report = {
  url,
  runsPerSide: runs,
  current,
  baseline,
  deltaPct: baseline ? Math.round(((current.meanMs - baseline.meanMs) / baseline.meanMs) * 1000) / 10 : null,
};
writeFileSync(`${outDir}/bench-2km-compare.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
