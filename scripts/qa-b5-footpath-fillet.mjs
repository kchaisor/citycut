/**
 * Footpath junction before/after fillet PNGs (synthetic T junction, not a crossing blob).
 * npx vite-node scripts/qa-b5-footpath-fillet.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { planPaths, svgRings } from "../src/lib/svgPlan.ts";
import { DEFAULT_LINE_STYLES, footpathEdgeSvgAttrs } from "../src/lib/drawingStyle.ts";
import { getColour } from "../src/lib/colours.ts";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

function junctionModel() {
  return {
    placeLabel: "Footpath T junction QA",
    center: { lat: -37.8136, lon: 144.9631 },
    sideM: 120,
    layers: { buildings: false, roads: true, waterGreen: false, trees: false },
    buildings: [],
    roads: [
      { id: 1, line: [[-45, 8], [45, 8]], width: 3.2, kind: "road", grade: "path" },
      { id: 2, line: [[0, 8], [0, -45]], width: 3.2, kind: "road", grade: "path" },
    ],
    areas: [],
    trees: [],
    roadKm: 0.2,
    buildingCapHit: false,
    sourceNote: "QA",
  };
}

function renderSvg(model, filletM, label) {
  const style = {
    ...DEFAULT_LINE_STYLES,
    pathEdgeOn: true,
    path: { ...DEFAULT_LINE_STYLES.path, mm: 0.08 },
    pathFilletM: filletM,
  };
  const plan = planPaths(model, style.pathWidthM, style.contourIndexEvery, 1000, style.contourCoarseIntervalM, style.contourCoarseFromScale, {
    pathFilletM: filletM,
  });
  const fill = style.pathFill;
  const d = plan.pathFill.map((polygon) => svgRings(polygon)).join(" ");
  const edge = footpathEdgeSvgAttrs(style, "round");
  const stroke = edge.stroke === "none" ? "none" : edge.stroke;
  const strokeWidth = edge.stroke === "none" ? 0 : 0.15;
  const half = model.sideM / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${model.sideM} ${model.sideM}" width="900" height="900" style="background:${getColour("--sheet-fill")}">
  <text x="${-half + 4}" y="${-half + 14}" font-family="sans-serif" font-size="4">${label} · fillet ${filletM} m · 1:1000</text>
  <path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
}

const model = junctionModel();
writeFileSync(`${outDir}/b5-footpath-junction-fixture-before.svg`, renderSvg(model, 0, "Before"));
writeFileSync(`${outDir}/b5-footpath-junction-fixture-after.svg`, renderSvg(model, 2, "After"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 920, height: 920 } });
await page.setContent(renderSvg(model, 0, "Before"));
await page.screenshot({ path: `${outDir}/b5-footpath-junction-fixture-before.png` });
await page.setContent(renderSvg(model, 2, "After"));
await page.screenshot({ path: `${outDir}/b5-footpath-junction-fixture-after.png` });
await browser.close();
console.log("Wrote footpath junction QA to", outDir);
