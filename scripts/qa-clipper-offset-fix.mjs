/**
 * QA for Clipper offset fix: Fitzroy path crossing, tram/median crop, 1 km full frame.
 * npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 * npx vite-node scripts/qa-clipper-offset-fix.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, execSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";

async function saveModel(page, lat, lon, km, dest) {
  await page.goto(`${base}?qa=1&lat=${lat}&lon=${lon}&km=${km}`, {
    waitUntil: "networkidle",
    timeout: 180_000,
  });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForFunction(
    () => {
      const snap = window.__citycutQaModel?.exportPlanSnapshot?.();
      return (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 20 && snap?.sideM > 0;
    },
    null,
    { timeout: 600_000 },
  );
  const snapshot = await page.evaluate(() => window.__citycutQaModel?.exportPlanSnapshot?.() ?? null);
  writeFileSync(dest, JSON.stringify(snapshot));
  return snapshot;
}

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await saveModel(page, -37.8131, 144.98, 0.35, `${outDir}/fitzroy-model.json`);
await saveModel(page, -37.8136, 144.9831, 1, `${outDir}/east-model.json`);
await browser.close();

// Fitzroy diagonal path crossing (~40 m), centre of gardens in local plan space
const fitzroyViewBox = "380 20 80 80";
execSync(
  `npx vite-node scripts/render-site-plan-crop.mjs ${outDir}/fitzroy-model.json fitzroy-main "${fitzroyViewBox}" 2`,
  { stdio: "inherit" },
);
execSync(
  `cp ${outDir}/footpath-fillet-plan-fitzroy-main.png ${outDir}/clipper-fix-fitzroy-after.png`,
  { stdio: "inherit" },
);
execSync(
  `cp ${outDir}/footpath-fillet-plan-fitzroy-main.svg ${outDir}/clipper-fix-fitzroy-after.svg`,
  { stdio: "inherit" },
);

// Wellington Pde / tram corridor area (0.45 km CBD east)
async function saveWellington() {
  const b = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
  const p = await b.newPage();
  await saveModel(p, -37.8148, 144.9845, 0.45, `${outDir}/wellington-model.json`);
  await b.close();
}
await saveWellington();
const tramViewBox = "420 -30 90 90";
execSync(
  `npx vite-node scripts/render-site-plan-crop.mjs ${outDir}/wellington-model.json tram-gap "${tramViewBox}" 2`,
  { stdio: "inherit" },
);
execSync(`cp ${outDir}/footpath-fillet-plan-tram-gap.png ${outDir}/clipper-fix-tram-gap.png`, {
  stdio: "inherit",
});

const { planViewportExtent } = await import("../src/lib/planViewport.ts");
const east = JSON.parse(readFileSync(`${outDir}/east-model.json`, "utf8"));
const full = planViewportExtent(east.sideM);
const fullViewBox = `${full.x} ${full.y} ${full.w} ${full.h}`;
execSync(
  `npx vite-node scripts/render-site-plan-crop.mjs ${outDir}/east-model.json full-1km "${fullViewBox}" 2`,
  { stdio: "inherit" },
);
execSync(`cp ${outDir}/footpath-fillet-plan-full-1km.png ${outDir}/clipper-fix-full-1km-after.png`, {
  stdio: "inherit",
});

// Bench 1 km plan build (PR code)
execSync(`npx vite-node scripts/bench-plan-1km.mjs ${outDir}/east-model.json pr-clipper-fix`, {
  stdio: "inherit",
});

console.log("QA complete", outDir);
