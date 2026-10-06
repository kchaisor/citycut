import { performance } from "node:perf_hooks";
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import { sitePlanChunks } from "../src/lib/aiPlan.ts";
import { cityModelTo3dm } from "../src/lib/rhinoExport.ts";
import { DEFAULT_LINE_STYLES } from "../src/lib/drawingStyle.ts";

function square(minX, minY, maxX, maxY) {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function terrain() {
  return {
    cols: 3,
    rows: 3,
    heights: Float32Array.of(0, 1, 2, 0.4, 1.2, 2.2, 0.2, 1.1, 2.4),
    min: 0,
    max: 2.4,
    spacingM: 50,
    zoom: 14,
    metresPerPixel: 8,
    source: "Mapterhorn",
  };
}

const bare = {
  placeLabel: "Test Block",
  center: { lon: 144.9631, lat: -37.8136 },
  sideM: 100,
  layers: { buildings: true, roads: true, waterGreen: true, trees: true },
  buildings: [
    {
      id: 1,
      ring: square(-20, -20, 20, 20),
      holes: [square(-5, -5, 5, 5)],
      height: 12,
      use: "residential",
      source: "osm_tag",
    },
  ],
  roads: [{ id: 2, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" }],
  areas: [{ id: 3, ring: square(-45, -45, -30, -30), holes: [], kind: "green" }],
  trees: [{ id: 4, at: [20, 30], height_m: 10, crown_diameter_m: 8, trunk_diameter_m: 0.3, sizeSource: "osm" }],
  roadKm: 0.16,
  buildingCapHit: false,
  sourceNote: "test",
  terrain: terrain(),
  contours: true,
};

const withSite = {
  ...bare,
  siteBuildingIds: [1],
  siteBoundaryLines: [square(-40, -40, 40, 40)],
};

function chunkNames(model) {
  return sitePlanChunks(model, 1000, DEFAULT_LINE_STYLES)
    .map((chunk) => chunk.name)
    .sort();
}

const baselineChunks = chunkNames(bare);
const siteChunks = chunkNames(withSite);

const t0 = performance.now();
const group = buildCityGroup(bare);
disposeObject(group);
const baselineBuildMs = Math.round(performance.now() - t0);

const t1 = performance.now();
const groupSite = buildCityGroup(withSite);
disposeObject(groupSite);
const siteBuildMs = Math.round(performance.now() - t1);

const bytesBaseline = await cityModelTo3dm(bare);
const bytesSite = await cityModelTo3dm(withSite);

const result = {
  chunkNamesMatch: JSON.stringify(baselineChunks) === JSON.stringify(siteChunks),
  baselineChunks,
  rhinoSizeDelta: bytesSite.length - bytesBaseline.length,
  baselineBuildMs,
  siteBuildMs,
  buildDeltaMs: siteBuildMs - baselineBuildMs,
};

console.log(JSON.stringify(result, null, 2));
if (!result.chunkNamesMatch) process.exit(1);
