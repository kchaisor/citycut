/**
 * East Melbourne footpath fillet QA at fixed street corner crop + full frame.
 * Uses live site plan (Drawing) for before/after when responsive; planPaths fallback in render script.
 * npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 * npx vite-node scripts/qa-footpath-fillet-east-melbourne.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const lat = -37.8136;
const lon = 144.9831;
const km = 1;
const cornerViewBox = "430 -120 70 70";

async function createModel(page) {
  await page.goto(`${base}?qa=1&view=persp&lat=${lat}&lon=${lon}&km=${km}`, {
    waitUntil: "networkidle",
    timeout: 180_000,
  });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForFunction(
    () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 200,
    null,
    { timeout: 600_000 },
  );
}

async function trySitePlanCrop(page, filletM, viewBox, dest) {
  await page.addInitScript(({ fillet }) => {
    window.localStorage.setItem(
      "citycut.lineStyles",
      JSON.stringify({
        "--path-fillet-m": String(fillet),
        "--path-edge": "on",
        "--path-edge-mm": "0.08",
      }),
    );
  }, { fillet: filletM });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".model-chrome").getByRole("button", { name: "Drawing", exact: true }).click();
  await page.waitForTimeout(300);
  const sitePlanBtn = page.getByRole("button", { name: "Site plan", exact: true });
  if ((await sitePlanBtn.getAttribute("aria-pressed")) !== "true") await sitePlanBtn.click();
  await page.waitForSelector(".fill.is-plan svg.plan:not(.figure-ground)", { timeout: 120_000 });
  await page.getByLabel("Plan scale", { exact: true }).selectOption("500");
  await page.waitForTimeout(500);
  await page.addStyleTag({
    content: ".model-chrome .icon-rail, .model-chrome .drawer { visibility: hidden !important; }",
  });
  await page.evaluate((vb) => {
    const svg = document.querySelector(".fill.is-plan svg.plan");
    if (svg) svg.setAttribute("viewBox", vb);
  }, viewBox);
  await page.locator(".fill.is-plan").screenshot({ path: dest });
}

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(120_000);

await createModel(page);
writeFileSync(`${outDir}/east-model.json`, JSON.stringify(await page.evaluate(() => window.__citycutQaModel?.exportPlanSnapshot?.() ?? null)));

try {
  await trySitePlanCrop(page, 0, cornerViewBox, `${outDir}/footpath-fillet-east-before.png`);
  await trySitePlanCrop(page, 2, cornerViewBox, `${outDir}/footpath-fillet-east-after.png`);
} catch (err) {
  console.warn("Site plan UI capture failed, using planPaths renders:", err);
  execSync(
    `npx vite-node scripts/render-site-plan-crop.mjs ${outDir}/east-model.json ui-before "${cornerViewBox}" 0`,
    { stdio: "inherit" },
  );
  execSync(
    `npx vite-node scripts/render-site-plan-crop.mjs ${outDir}/east-model.json ui-after "${cornerViewBox}" 2`,
    { stdio: "inherit" },
  );
}

await browser.close();

execSync(`npx vite-node scripts/render-site-plan-crop.mjs ${outDir}/east-model.json export-before "${cornerViewBox}" 0`, {
  stdio: "inherit",
});
execSync(`npx vite-node scripts/render-site-plan-crop.mjs ${outDir}/east-model.json export-after "${cornerViewBox}" 2`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-export-before.png ${outDir}/footpath-fillet-export-before.png`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-export-after.png ${outDir}/footpath-fillet-export-after.png`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-export-before.svg ${outDir}/footpath-fillet-export-before.svg`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-export-after.svg ${outDir}/footpath-fillet-export-after.svg`, {
  stdio: "inherit",
});

const { planViewportExtent } = await import("../src/lib/planViewport.ts");
const { readFileSync } = await import("node:fs");
const model = JSON.parse(readFileSync(`${outDir}/east-model.json`, "utf8"));
const full = planViewportExtent(model.sideM);
const fullViewBox = `${full.x} ${full.y} ${full.w} ${full.h}`;
execSync(`npx vite-node scripts/render-site-plan-crop.mjs ${outDir}/east-model.json full-after "${fullViewBox}" 2`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-full-after.png ${outDir}/footpath-fillet-east-full-after.png`, {
  stdio: "inherit",
});

console.log("QA artifacts in", outDir);
