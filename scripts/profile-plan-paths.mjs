/**
 * Per-stage planPaths wall time (single run, ms).
 * Usage: CITYCUT_ROOT=/path npx vite-node scripts/profile-plan-paths.mjs <model.json> [label]
 */
import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.CITYCUT_ROOT ?? join(scriptDir, "..");

const roadFill = await import(pathToFileURL(join(repoRoot, "src/lib/roadFill.ts")).href);
const {
  footpathStrips,
  mergeFootpathFragments,
  subtractFootpathBlockers,
  unionFootpathStrips,
  unionRoadSurface,
  clearFootpathUnionCacheForTests,
  DEFAULT_PATH_FILLET_M,
} = roadFill;
const footpathDisplayAfterRoadBlockers = roadFill.footpathDisplayAfterRoadBlockers;
const roadFillDisplayPolygons = roadFill.roadFillDisplayPolygons;
const footpathFillDisplayPolygons = roadFill.footpathFillDisplayPolygons;
let fillRoadMedianHoles = (road) => road;
let splitGreenForRoadLayer = (green) => ({ green, greenOnRoad: [] });
if (existsSync(join(repoRoot, "src/lib/roadSurfacePlan.ts"))) {
  ({ fillRoadMedianHoles, splitGreenForRoadLayer } = await import(
    pathToFileURL(join(repoRoot, "src/lib/roadSurfacePlan.ts")).href,
  ));
}
const { clipAreaToSiteFrame, clipPolylineSiteFrame, pointInSiteFrame, DEFAULT_SITE_FRAME_SHAPE } = await import(
  pathToFileURL(join(repoRoot, "src/lib/siteFrame.ts")).href,
);
const { planBuildingFill } = await import(pathToFileURL(join(repoRoot, "src/lib/planBuildingFill.ts")).href);
const { PATH_WIDTH_M } = await import(pathToFileURL(join(repoRoot, "src/lib/lineweights.ts")).href);
const { demContourLayer, drawContours, drawnContourInterval, altitudeOnInterval } = await import(
  pathToFileURL(join(repoRoot, "src/lib/vicmapContours.ts")).href,
);

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/east-model.json";
const label = process.argv[3] ?? "run";
const model = JSON.parse(readFileSync(modelPath, "utf8"));

function clipRings(outer, holes, sideM, frameShape) {
  return clipAreaToSiteFrame(outer, holes, sideM, frameShape);
}

function clipLines(line, sideM, frameShape) {
  const dedupe = (pts) => {
    const out = [];
    for (const point of pts) {
      const prev = out[out.length - 1];
      if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.05) out.push(point);
    }
    return out;
  };
  return clipPolylineSiteFrame(dedupe(line), sideM, frameShape).map(dedupe).filter((part) => part.length >= 2);
}

clearFootpathUnionCacheForTests();
const stages = { citycutRoot: repoRoot };
const t0 = performance.now();

const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
let t = performance.now();
const green = [];
const water = [];
for (const area of model.areas) {
  const rings = clipRings(area.ring, area.holes, model.sideM, frameShape);
  if (!rings) continue;
  if (area.kind === "water") water.push(rings);
  else green.push(rings);
}
stages.areasMs = Math.round(performance.now() - t);

t = performance.now();
const rails = [];
for (const road of model.roads) {
  if (road.kind === "rail") {
    for (const line of clipLines(road.line, model.sideM, frameShape)) rails.push(line);
  }
}
const trams = [];
for (const line of model.tramLines ?? []) {
  for (const part of clipLines(line, model.sideM, frameShape)) trams.push(part);
}
stages.railTramMs = Math.round(performance.now() - t);

const pathFilletM = DEFAULT_PATH_FILLET_M;
t = performance.now();
const footpaths = unionFootpathStrips(
  footpathStrips(model.roads, PATH_WIDTH_M),
  model.sideM,
  frameShape,
  pathFilletM,
  PATH_WIDTH_M,
);
stages.footpathUnionMs = Math.round(performance.now() - t);

t = performance.now();
const carriageway = unionRoadSurface(model.roads, model.tramLines, model.sideM, frameShape);
stages.roadSurfaceMs = Math.round(performance.now() - t);

t = performance.now();
if (pathFilletM > 0 && carriageway.polygons.length > 0) {
  mergeFootpathFragments(subtractFootpathBlockers(footpaths.polygons, carriageway.polygons));
}
stages.pathBlockMergeMs = Math.round(performance.now() - t);

t = performance.now();
if (typeof footpathFillDisplayPolygons === "function") {
  footpathFillDisplayPolygons(footpaths, model.sideM, frameShape);
}
stages.displayFootpathFilletMs = Math.round(performance.now() - t);

t = performance.now();
if (typeof footpathDisplayAfterRoadBlockers === "function") {
  const footDisp = footpathFillDisplayPolygons(footpaths, model.sideM, frameShape);
  const roadDisp =
    typeof roadFillDisplayPolygons === "function"
      ? fillRoadMedianHoles(roadFillDisplayPolygons(carriageway, model.sideM, frameShape))
      : [];
  if (pathFilletM > 0 && roadDisp.length > 0) {
    footpathDisplayAfterRoadBlockers(footDisp, roadDisp);
  }
}
stages.displayFootpathClipMs = Math.round(performance.now() - t);

t = performance.now();
if (typeof roadFillDisplayPolygons === "function") {
  fillRoadMedianHoles(roadFillDisplayPolygons(carriageway, model.sideM, frameShape));
}
stages.displayRoadMorphMs = Math.round(performance.now() - t);

t = performance.now();
const roadFillCoarse = fillRoadMedianHoles(carriageway.polygons);
stages.medianHolesMs = Math.round(performance.now() - t);

t = performance.now();
splitGreenForRoadLayer(green, roadFillCoarse);
stages.greenSplitMs = Math.round(performance.now() - t);

t = performance.now();
stages.ringSmoothMs = Math.round(performance.now() - t);

t = performance.now();
for (const building of model.buildings) {
  const rings = clipRings(building.ring, building.holes, model.sideM, frameShape);
  if (!rings) continue;
  planBuildingFill(model, building, { colourByUse: true, uniformBuildings: false, colourBySource: false }, false);
}
stages.buildingsMs = Math.round(performance.now() - t);

t = performance.now();
const layer =
  model.contours === false
    ? null
    : model.contourLayer
      ? model.contourLayer
      : model.contours && model.terrain
        ? demContourLayer(model.terrain, model.sideM)
        : null;
if (layer) {
  const clipped = layer.lines.flatMap((line) =>
    clipLines(line.points, model.sideM, frameShape).map((points) => ({ points, z: line.z })),
  );
  const drawnInterval = drawnContourInterval(layer.source, layer.interval, 500, 5, 2500);
  const visible =
    drawnInterval > layer.interval ? clipped.filter((line) => altitudeOnInterval(line.z, drawnInterval)) : clipped;
  if (visible.length > 0) drawContours(visible, drawnInterval, 5);
}
stages.contoursMs = Math.round(performance.now() - t);

model.trees.filter((tree) => pointInSiteFrame(tree.at, model.sideM, frameShape));
stages.totalMs = Math.round(performance.now() - t0);

const row = { label, model: modelPath, ...stages };
mkdirSync("/opt/cursor/artifacts", { recursive: true });
appendFileSync("/opt/cursor/artifacts/profile-plan-paths.jsonl", JSON.stringify(row) + "\n");
console.log(JSON.stringify(row, null, 2));
