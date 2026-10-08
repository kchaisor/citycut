/**
 * Rasterize site-plan layers (planPaths) at a fixed viewBox for regression shots.
 * Usage: npx vite-node scripts/render-site-plan-crop.mjs <model.json> <label>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import * as roadFill from "../src/lib/roadFill.ts";
const clearFootpathUnionCacheForTests =
  roadFill.clearFootpathUnionCacheForTests ?? (() => {});
import { planPaths, svgRings, svgPolyline } from "../src/lib/svgPlan.ts";
import { DEFAULT_LINE_STYLES, footpathEdgeSvgAttrs } from "../src/lib/drawingStyle.ts";
import { getColour } from "../src/lib/colours.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const modelPath = process.argv[2];
const label = process.argv[3] ?? "shot";
if (!modelPath) throw new Error("model path required");
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const viewBox = process.argv[4] ?? "430 -120 70 70";
const filletM = Number(process.argv[5] ?? "2");

function buildSvg(model, fillet) {
  clearFootpathUnionCacheForTests();
  const style = { ...DEFAULT_LINE_STYLES, pathEdgeOn: true, pathFilletM: fillet };
  const opts = { pathFilletM: fillet };
  const plan = planPaths(
    model,
    PATH_WIDTH_M,
    5,
    500,
    5,
    2500,
    opts,
  );
  const pathD = plan.pathFill.map((p) => svgRings(p)).join(" ");
  const roadD = plan.roadFill.map((p) => svgRings(p)).join(" ");
  const greenD = plan.green.map((rings) => svgRings(rings)).join(" ");
  const greenOnRoadD = plan.greenOnRoad.map((rings) => svgRings(rings)).join(" ");
  const waterD = plan.water.map((rings) => svgRings(rings)).join(" ");
  const buildings = plan.buildings
    .map((b) => `<path d="${svgRings(b.rings)}" fill="${b.fill}" fill-rule="evenodd"/>`)
    .join("");
  const edge = footpathEdgeSvgAttrs(style, "round");
  const pathStroke =
    edge.stroke === "none" ? "" : `stroke="${edge.stroke}" stroke-width="0.12" vector-effect="non-scaling-stroke"`;
  const sheet = getColour("--sheet-fill");
  const greenFill = getColour("--green-fill");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="900" height="900" style="background:${sheet}">
  <rect x="-500" y="-500" width="1000" height="1000" fill="${sheet}"/>
  <path d="${greenD}" fill="${greenFill}" fill-rule="evenodd"/>
  <path d="${waterD}" fill="${getColour("--water-fill")}" fill-rule="evenodd"/>
  <path d="${pathD}" fill="${style.pathFill}" fill-rule="evenodd" ${pathStroke}/>
  ${plan.contours.map((line) => `<path d="${svgPolyline(line, false)}" fill="none" stroke="${style.contour.color}" stroke-width="0.03"/>`).join("")}
  <path d="${roadD}" fill="${style.roadFill}" fill-rule="evenodd"/>
  <path d="${greenOnRoadD}" fill="${greenFill}" fill-rule="evenodd"/>
  ${buildings}
</svg>`;
}

const outDir = "/opt/cursor/artifacts";
const dest = `${outDir}/footpath-fillet-plan-${label}.png`;
const svg = buildSvg(model, filletM);
writeFileSync(dest.replace(".png", ".svg"), svg);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.setContent(svg);
await page.screenshot({ path: dest });
await browser.close();
console.log("wrote", dest);
