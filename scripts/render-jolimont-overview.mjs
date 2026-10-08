/**
 * Full Jolimont plan overview with 50 m grid labels (viewBox coords).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { planPaths, svgRings, svgPolyline } from "../src/lib/svgPlan.ts";
import { DEFAULT_LINE_STYLES, footpathEdgeSvgAttrs } from "../src/lib/drawingStyle.ts";
import { getColour } from "../src/lib/colours.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { planViewportExtent } from "../src/lib/planViewport.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const view = planViewportExtent(model.sideM);
const crops = JSON.parse(readFileSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json", "utf8"));

clearFootpathUnionCacheForTests();
const style = { ...DEFAULT_LINE_STYLES, pathEdgeOn: true, pathFilletM: 2 };
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
const sheet = getColour("--sheet-fill");
const greenFill = getColour("--green-fill");

const gridStep = 50;
const gridLines = [];
const labels = [];
for (let x = Math.ceil(view.x / gridStep) * gridStep; x <= view.x + view.w; x += gridStep) {
  gridLines.push(`M${x} ${view.y} L${x} ${view.y + view.h}`);
  labels.push(`<text x="${x + 2}" y="${view.y + 14}" font-size="8" fill="#666">${x}</text>`);
}
for (let svgY = Math.ceil(view.y / gridStep) * gridStep; svgY <= view.y + view.h; svgY += gridStep) {
  gridLines.push(`M${view.x} ${svgY} L${view.x + view.w} ${svgY}`);
  const north = -svgY;
  labels.push(`<text x="${view.x + 4}" y="${svgY + 10}" font-size="8" fill="#666">n${Math.round(north)}</text>`);
}

function rectSvg(vb, label, color) {
  const [x, y, w, h] = vb.split(" ").map(Number);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="1.2"/>
  <text x="${x + 2}" y="${y + 12}" font-size="9" fill="${color}">${label}</text>`;
}

const cropRects = [
  rectSvg(crops.facetSpot, "facet", "#c00"),
  rectSvg(crops.kerbReturn, "kerb", "#00c"),
  rectSvg(crops.roadGaps, "gaps", "#080"),
  rectSvg(crops.pathKink, "kink", "#808"),
];

const pathD = plan.pathFill.map((p) => svgRings(p)).join(" ");
const roadD = plan.roadFill.map((p) => svgRings(p)).join(" ");
const greenD = plan.green.map((rings) => svgRings(rings)).join(" ");
const greenOnRoadD = (plan.greenOnRoad ?? []).map((rings) => svgRings(rings)).join(" ");
const waterD = plan.water.map((rings) => svgRings(rings)).join(" ");
const buildings = plan.buildings
  .map((b) => `<path d="${svgRings(b.rings)}" fill="${b.fill}" fill-rule="evenodd"/>`)
  .join("");
const edge = footpathEdgeSvgAttrs(style, "round");
const pathStroke =
  edge.stroke === "none" ? "" : `stroke="${edge.stroke}" stroke-width="0.12" vector-effect="non-scaling-stroke"`;
const contours = plan.contours
  .map((line) => `<path d="${svgPolyline(line, false)}" fill="none" stroke="${style.contour.color}" stroke-width="0.08"/>`)
  .join("");

const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1200" height="1200">
  <rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="${sheet}"/>
  ${greenD ? `<path d="${greenD}" fill="${greenFill}" fill-rule="evenodd"/>` : ""}
  ${waterD ? `<path d="${waterD}" fill="${getColour("--water-fill")}" fill-rule="evenodd"/>` : ""}
  ${roadD ? `<path d="${roadD}" fill="${style.roadFill}" fill-rule="evenodd"/>` : ""}
  ${greenOnRoadD ? `<path d="${greenOnRoadD}" fill="${greenFill}" fill-rule="evenodd"/>` : ""}
  ${pathD ? `<path d="${pathD}" fill="${style.pathFill}" fill-rule="evenodd" ${pathStroke}/>` : ""}
  ${contours}
  ${buildings}
  <g stroke="#999" stroke-width="0.15" opacity="0.7">${gridLines.map((d) => `<path d="${d}"/>`).join("")}</g>
  ${labels.join("")}
  ${cropRects.join("")}
</svg>`;

mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/overview-grid.svg", svg);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
await page.setContent(svg);
await page.screenshot({ path: "/opt/cursor/artifacts/overview-grid.png" });
await page.screenshot({ path: "/opt/cursor/artifacts/overview-crops.png" });
await browser.close();
console.log("wrote overview-grid.png and overview-crops.png", viewBox);
