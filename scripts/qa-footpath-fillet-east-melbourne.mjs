/**
 * East Melbourne footpath fillet QA: data-driven street corner + full-frame after.
 * npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 * npx vite-node scripts/qa-footpath-fillet-east-melbourne.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { planPaths, svgRings, svgPolyline } from "../src/lib/svgPlan.ts";
import { planViewportExtent } from "../src/lib/planViewport.ts";
import {
  DEFAULT_LINE_STYLES,
  footpathEdgeSvgAttrs,
} from "../src/lib/drawingStyle.ts";
import { getColour } from "../src/lib/colours.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const lat = -37.8136;
const lon = 144.9831;
const km = 1;

function pointInRing(point, ring) {
  let hits = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1];
    const yj = ring[j][1];
    if (yi > point[1] === yj > point[1]) continue;
    const x = ((ring[j][0] - ring[i][0]) * (point[1] - yi)) / (yj - yi) + ring[i][0];
    if (point[0] < x) hits += 1;
  }
  return hits % 2 === 1;
}

function insideMulti(polygons, x, y) {
  for (const poly of polygons) {
    const outer = poly[0];
    if (!outer) continue;
    if (pointInRing([x, y], outer)) {
      for (const hole of poly.slice(1)) {
        if (pointInRing([x, y], hole)) return false;
      }
      return true;
    }
  }
  return false;
}

function insideGreen(green, x, y) {
  for (const rings of green) {
    const outer = rings[0];
    if (!outer) continue;
    if (pointInRing([x, y], outer)) return true;
  }
  return false;
}

function cropMetrics(bundle, cx, cy, half) {
  let diff = 0;
  let road = 0;
  let foot = 0;
  let green = 0;
  let samples = 0;
  for (let x = cx - half; x <= cx + half; x += 2) {
    for (let y = cy - half; y <= cy + half; y += 2) {
      samples++;
      const a = insideMulti(bundle.sharp.pathFill, x, y);
      const b = insideMulti(bundle.filleted.pathFill, x, y);
      if (a !== b) diff++;
      if (insideMulti(bundle.filleted.roadFill, x, y)) road++;
      if (insideMulti(bundle.filleted.pathFill, x, y)) foot++;
      if (insideGreen(bundle.filleted.green, x, y)) green++;
    }
  }
  return { diff, road, foot, green, samples };
}

function findStreetCornerCrop(model, half = 35) {
  clearFootpathUnionCacheForTests();
  const sharp = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 0 });
  clearFootpathUnionCacheForTests();
  const filleted = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
  const bundle = { sharp, filleted };

  let best = { score: 0, cx: 0, cy: 0, diff: 0 };
  const halfSide = model.sideM / 2;
  for (let cx = -halfSide + half; cx <= halfSide - half; cx += 30) {
    for (let cy = -halfSide + half; cy <= halfSide - half; cy += 30) {
      const m = cropMetrics(bundle, cx, cy, half);
      const roadFrac = m.road / m.samples;
      const greenFrac = m.green / m.samples;
      const footFrac = m.foot / m.samples;
      if (roadFrac < 0.06 || footFrac < 0.02 || m.diff < 3) continue;
      if (greenFrac > 0.4) continue;
      const score = m.diff * roadFrac * footFrac * (1 - greenFrac);
      if (score > best.score) best = { score, cx, cy, ...m, roadFrac, greenFrac };
    }
  }
  for (let cx = best.cx - 25; cx <= best.cx + 25; cx += 5) {
    for (let cy = best.cy - 25; cy <= best.cy + 25; cy += 5) {
      const m = cropMetrics(bundle, cx, cy, half);
      const roadFrac = m.road / m.samples;
      const greenFrac = m.green / m.samples;
      const footFrac = m.foot / m.samples;
      if (roadFrac < 0.06 || footFrac < 0.02 || m.diff < 3) continue;
      if (greenFrac > 0.4) continue;
      const score = m.diff * roadFrac * footFrac * (1 - greenFrac);
      if (score > best.score) best = { score, cx, cy, ...m, roadFrac, greenFrac };
    }
  }

  const size = half * 2;
  return {
    x: best.cx - half,
    y: best.cy - half,
    w: size,
    h: size,
    center: [best.cx, best.cy],
    score: best.score,
    diffCells: best.diff,
    roadFrac: best.roadFrac,
    greenFrac: best.greenFrac,
  };
}

function buildSitePlanSvg(model, filletM, viewBox) {
  clearFootpathUnionCacheForTests();
  const style = { ...DEFAULT_LINE_STYLES, pathEdgeOn: true, pathFilletM: filletM };
  const plan = planPaths(
    model,
    style.pathWidthM,
    style.contourIndexEvery,
    500,
    style.contourCoarseIntervalM,
    style.contourCoarseFromScale,
    { pathFilletM: filletM },
  );
  const greenFill = getColour("--green-fill");
  const waterFill = getColour("--water-fill");
  const sheet = getColour("--sheet-fill");
  const pathD = plan.pathFill.map((polygon) => svgRings(polygon)).join(" ");
  const roadD = plan.roadFill.map((polygon) => svgRings(polygon)).join(" ");
  const greenD = plan.green.map((rings) => svgRings(rings)).join(" ");
  const waterD = plan.water.map((rings) => svgRings(rings)).join(" ");
  const buildingD = plan.buildings
    .map((b) => `<path d="${svgRings(b.rings)}" fill="${b.fill}" fill-rule="evenodd"/>`)
    .join("");
  const edge = footpathEdgeSvgAttrs(style, "round");
  const pathStroke = edge.stroke === "none" ? "" : `stroke="${edge.stroke}" stroke-width="0.12" vector-effect="non-scaling-stroke"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="900" height="900" style="background:${sheet}">
  <path d="${greenD}" fill="${greenFill}" fill-rule="evenodd"/>
  <path d="${waterD}" fill="${waterFill}" fill-rule="evenodd"/>
  <path d="${pathD}" fill="${style.pathFill}" fill-rule="evenodd" ${pathStroke}/>
  ${plan.contours.map((line) => `<path d="${svgPolyline(line, false)}" fill="none" stroke="${style.contour.color}" stroke-width="0.03"/>`).join("")}
  <path d="${roadD}" fill="${style.roadFill}" fill-rule="evenodd"/>
  ${buildingD}
</svg>`;
}

async function createEastMelbourneModel(page) {
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

async function renderPlanPng(page, model, filletM, viewBox, dest) {
  const svg = buildSitePlanSvg(model, filletM, viewBox);
  writeFileSync(dest.replace(/\.png$/, ".svg"), svg);
  await page.setContent(svg);
  await page.screenshot({ path: dest });
}

function exportPathOnlySvg(model, filletM, viewBox, destPng) {
  clearFootpathUnionCacheForTests();
  const style = { ...DEFAULT_LINE_STYLES, pathEdgeOn: true, pathFilletM: filletM };
  const plan = planPaths(
    model,
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="900" height="900" style="background:${getColour("--sheet-fill")}">
  <path d="${roadD}" fill="${style.roadFill}" fill-rule="evenodd"/>
  <path d="${pathD}" fill="${style.pathFill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="0.12" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
</svg>`;
  writeFileSync(destPng.replace(/\.png$/, ".svg"), svg);
  return svg;
}

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const renderPage = await browser.newPage({ viewport: { width: 900, height: 900 } });

const createPage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
createPage.setDefaultTimeout(180_000);
await createEastMelbourneModel(createPage);
const cityModel = await createPage.evaluate(() => window.__citycutQaModel?.exportPlanSnapshot?.() ?? null);
await createPage.close();
if (!cityModel) throw new Error("Could not export city model for QA");

const crop = findStreetCornerCrop(cityModel);
writeFileSync(`${outDir}/footpath-fillet-crop.json`, JSON.stringify(crop, null, 2));
console.log("Street corner crop:", crop);
const cornerViewBox = `${crop.x} ${crop.y} ${crop.w} ${crop.h}`;

await renderPlanPng(renderPage, cityModel, 0, cornerViewBox, `${outDir}/footpath-fillet-east-before.png`);
await renderPlanPng(renderPage, cityModel, 2, cornerViewBox, `${outDir}/footpath-fillet-east-after.png`);
const full = planViewportExtent(cityModel.sideM);
const fullViewBox = `${full.x} ${full.y} ${full.w} ${full.h}`;
await renderPlanPng(renderPage, cityModel, 2, fullViewBox, `${outDir}/footpath-fillet-east-full-after.png`);

for (const [filletM, name] of [
  [0, "before"],
  [2, "after"],
]) {
  const svg = exportPathOnlySvg(cityModel, filletM, cornerViewBox, `${outDir}/footpath-fillet-export-${name}.png`);
  await renderPage.setContent(svg);
  await renderPage.screenshot({ path: `${outDir}/footpath-fillet-export-${name}.png` });
}

await browser.close();
console.log("East Melbourne footpath fillet QA written to", outDir);
