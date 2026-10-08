/**
 * Full site-plan SVG (planPaths, same layer order as DrawingPlan) at Kelvin crop viewBoxes.
 * Usage: CITYCUT_ROOT=/path/to/repo npx vite-node scripts/render-kelvin-plan-shots.mjs <model.json> <main|pr>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.CITYCUT_ROOT ?? join(scriptDir, "..");

const modelPath = process.argv[2];
const label = process.argv[3] ?? "pr";
if (!modelPath) throw new Error("model path required");

const model = JSON.parse(readFileSync(modelPath, "utf8"));
const cropFile = "/opt/cursor/artifacts/kelvin-jolimont-crops.json";
const crops = existsSync(cropFile)
  ? JSON.parse(readFileSync(cropFile, "utf8"))
  : {
      facetSpot: "125 385 70 70",
      kerbReturn: "142 442 20 20",
      roadGaps: "284 127 55 35",
      pathKink: "171 381 24 24",
    };

const { planPaths, svgRings, svgPolyline } = await import(pathToFileURL(join(repoRoot, "src/lib/svgPlan.ts")).href);
const { DEFAULT_LINE_STYLES, footpathEdgeSvgAttrs } = await import(
  pathToFileURL(join(repoRoot, "src/lib/drawingStyle.ts")).href,
);
const { getColour } = await import(pathToFileURL(join(repoRoot, "src/lib/colours.ts")).href);
const { PATH_WIDTH_M } = await import(pathToFileURL(join(repoRoot, "src/lib/lineweights.ts")).href);
const { clearFootpathUnionCacheForTests } = await import(pathToFileURL(join(repoRoot, "src/lib/roadFill.ts")).href);

const shots = {
  "facet-spot": crops.facetSpot,
  "kerb-return": crops.kerbReturn,
  "road-gaps": crops.roadGaps,
  "path-kink": crops.pathKink,
};

function buildSvg(viewBox, filletM = 2) {
  clearFootpathUnionCacheForTests();
  const style = { ...DEFAULT_LINE_STYLES, pathEdgeOn: true, pathFilletM: filletM };
  const smoothOutput = label === "pr";
  const planOptions = { pathFilletM: filletM, centrelineSmooth: smoothOutput };
  if (smoothOutput) planOptions.smoothOutput = true;
  else planOptions.smoothOutput = false;
  const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, planOptions);
  const sheet = getColour("--sheet-fill");
  const greenFill = getColour("--green-fill");
  const pathD = plan.pathFill.map((p) => svgRings(p)).join(" ");
  const roadD = plan.roadFill.map((p) => svgRings(p)).join(" ");
  const greenD = plan.green.map((rings) => svgRings(rings)).join(" ");
  const greenOnRoadD = (plan.greenOnRoad ?? []).map((rings) => svgRings(rings)).join(" ");
  const waterD = plan.water.map((rings) => svgRings(rings)).join(" ");
  const buildings = plan.buildings
    .map((b) => `<path d="${svgRings(b.rings)}" fill="${b.fill}" fill-rule="evenodd"/>`)
    .join("");
  const trees = plan.trees
    .map((t) => `<circle cx="${t.east}" cy="${-t.north}" r="${t.r}" fill="${getColour("--tree-crown")}" fill-opacity="0.55"/>`)
    .join("");
  const edge = footpathEdgeSvgAttrs(style, "round");
  const pathStroke =
    edge.stroke === "none" ? "" : `stroke="${edge.stroke}" stroke-width="0.12" vector-effect="non-scaling-stroke"`;
  const contours = plan.contours
    .map((line) => `<path d="${svgPolyline(line, false)}" fill="none" stroke="${style.contour.color}" stroke-width="0.03"/>`)
    .join("");
  const rails = plan.rails
    .map((line) => `<path d="${svgPolyline(line, false)}" fill="none" stroke="${style.rail.color}" stroke-width="0.15"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="900" height="900">
  <rect x="-500" y="-500" width="1000" height="1000" fill="${sheet}"/>
  ${greenD ? `<path d="${greenD}" fill="${greenFill}" fill-rule="evenodd"/>` : ""}
  ${waterD ? `<path d="${waterD}" fill="${getColour("--water-fill")}" fill-rule="evenodd"/>` : ""}
  ${roadD ? `<path d="${roadD}" fill="${style.roadFill}" fill-rule="evenodd"/>` : ""}
  ${greenOnRoadD ? `<path d="${greenOnRoadD}" fill="${greenFill}" fill-rule="evenodd"/>` : ""}
  ${pathD ? `<path d="${pathD}" fill="${style.pathFill}" fill-rule="evenodd" ${pathStroke}/>` : ""}
  ${contours}
  ${rails}
  ${buildings}
  ${trees}
</svg>`;
}

mkdirSync("/opt/cursor/artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

for (const [name, viewBox] of Object.entries(shots)) {
  const svg = buildSvg(viewBox);
  const dest = `/opt/cursor/artifacts/${name}-${label}.png`;
  writeFileSync(dest.replace(".png", ".svg"), svg);
  await page.setContent(svg);
  await page.screenshot({ path: dest });
  console.log(name, viewBox, "->", dest, "root", repoRoot);
}

await browser.close();
