/**
 * East Melbourne footpath fillet QA (Wellington Pde corner, ~70 m crop).
 * npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 * npx vite-node scripts/qa-footpath-fillet-east-melbourne.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { planPaths, svgRings } from "../src/lib/svgPlan.ts";
import { DEFAULT_LINE_STYLES, footpathEdgeSvgAttrs } from "../src/lib/drawingStyle.ts";
import { getColour } from "../src/lib/colours.ts";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const lat = -37.8136;
const lon = 144.9831;
const km = 1;
/** Local east/north metres: tight crop on Wellington Parade footpath corner (~70 m). */
const CROP = { x: -24, y: 322, w: 52, h: 52 };
const viewBox = `${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`;

async function openSitePlan(page, filletM) {
  await page.addInitScript(({ fillet }) => {
    const overrides = {
      "--path-fillet-m": String(fillet),
      "--path-edge": "on",
      "--path-edge-mm": "0.08",
    };
    window.localStorage.setItem("citycut.lineStyles", JSON.stringify(overrides));
  }, { fillet: filletM });
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
  await page.locator(".model-chrome").getByRole("button", { name: "Drawing", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Site plan", exact: true }).click();
  await page.waitForSelector(".fill.is-plan svg.plan:not(.figure-ground)", { timeout: 120_000 });
  await page.getByLabel("Plan scale", { exact: true }).selectOption("500");
  await page.waitForTimeout(600);
}

async function screenshotCrop(page, dest) {
  await page.addStyleTag({
    content: ".model-chrome .icon-rail, .model-chrome .drawer { visibility: hidden !important; }",
  });
  await page.evaluate((vb) => {
    const svg = document.querySelector(".fill.is-plan svg.plan");
    if (svg) svg.setAttribute("viewBox", vb);
  }, viewBox);
  await page.waitForTimeout(300);
  await page.locator(".fill.is-plan").screenshot({ path: dest });
}

function exportPathSvg(cityModel, filletM, destPng, browserPage) {
  clearFootpathUnionCacheForTests();
  const style = { ...DEFAULT_LINE_STYLES, pathEdgeOn: true, pathFilletM: filletM };
  const plan = planPaths(
    cityModel,
    style.pathWidthM,
    style.contourIndexEvery,
    500,
    style.contourCoarseIntervalM,
    style.contourCoarseFromScale,
    { pathFilletM: filletM },
  );
  const roadD = plan.roadFill.map((polygon) => svgRings(polygon)).join(" ");
  const pathD = plan.pathFill.map((polygon) => svgRings(polygon)).join(" ");
  const edge = footpathEdgeSvgAttrs(style, "round");
  const stroke = edge.stroke === "none" ? "none" : edge.stroke;
  const strokeWidth = edge.stroke === "none" ? 0 : 0.12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="900" height="900" style="background:${getColour("--sheet-fill")}">
  <path d="${roadD}" fill="${style.roadFill}" fill-rule="evenodd" stroke="none"/>
  <path d="${pathD}" fill="${style.pathFill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
</svg>`;
  const svgPath = destPng.replace(/\.png$/, ".svg");
  writeFileSync(svgPath, svg);
  return browserPage.setContent(svg).then(() => browserPage.screenshot({ path: destPng }));
}

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });

const beforePage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
beforePage.setDefaultTimeout(120_000);
await openSitePlan(beforePage, 0);
await screenshotCrop(beforePage, `${outDir}/footpath-fillet-east-before.png`);
const cityModel = await beforePage.evaluate(() => window.__citycutQaModel?.exportPlanSnapshot?.() ?? null);
await beforePage.close();

const afterPage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
afterPage.setDefaultTimeout(120_000);
await openSitePlan(afterPage, 2);
await screenshotCrop(afterPage, `${outDir}/footpath-fillet-east-after.png`);
await afterPage.close();

const exportPage = await browser.newPage({ viewport: { width: 900, height: 900 } });
if (cityModel) {
  await exportPathSvg(cityModel, 0, `${outDir}/footpath-fillet-export-before.png`, exportPage);
  await exportPathSvg(cityModel, 2, `${outDir}/footpath-fillet-export-after.png`, exportPage);
}
await exportPage.close();
await browser.close();
console.log("East Melbourne footpath fillet QA written to", outDir);
