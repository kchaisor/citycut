/**
 * Blast-radius proof: with Wind off, sitePlanChunks has no Wind layer;
 * uniform white and dash-dot boundary are the intentional deltas.
 */
import { performance } from "node:perf_hooks";
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import { sitePlanChunks } from "../src/lib/aiPlan.ts";
import { dashSegments, DEFAULT_LINE_STYLES } from "../src/lib/drawingStyle.ts";
import { getColour } from "../src/lib/colours.ts";
import { buildWindStreakBuffer, streakBoundsReport } from "../src/lib/windStreakGeometry.ts";

const m = {
  placeLabel: "Test",
  center: { lat: -37.8136, lon: 144.9631 },
  sideM: 400,
  roadKm: 0,
  buildingCapHit: false,
  buildings: [
    {
      id: 1,
      ring: [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
        [0, 0],
      ],
      holes: [],
      height: 12,
      use: "retail",
      source: "osm_tag",
    },
  ],
  roads: [],
  areas: [],
  trees: [],
  layers: { buildings: true, roads: true, waterGreen: true, trees: false },
  sourceNote: "test",
  siteBoundaryLines: [
    [
      [-50, -50],
      [50, -50],
    ],
  ],
};

const t0 = performance.now();
const group = buildCityGroup(m, { uniformBuildings: false });
group.updateMatrixWorld(true);
const buildMs = performance.now() - t0;
const boundary = group.getObjectByName("Site::Boundary");
const chunks = sitePlanChunks(m, 1000, DEFAULT_LINE_STYLES, { castShadows: false });
const chunkNames = chunks.map((c) => c.name);
disposeObject(group);

const uniformWhite = getColour("--building-uniform").toUpperCase() === "#FFFFFF";
const dash = dashSegments(DEFAULT_LINE_STYLES.siteBoundary.dash);
const windLayer = chunkNames.includes("Wind");

const streakBuffer = buildWindStreakBuffer(m.sideM, 0, null);
const streakBounds = streakBoundsReport(streakBuffer);

console.log(
  JSON.stringify(
    {
      buildCityGroupMs: Math.round(buildMs * 100) / 100,
      hasSiteBoundaryMesh: Boolean(boundary),
      sitePlanHasWindLayer: windLayer,
      uniformWhite,
      siteBoundaryDash: dash,
      streakBounds,
    },
    null,
    2,
  ),
);

if (!streakBounds.insideFrame || !streakBounds.aboveTerrain) process.exitCode = 1;

if (windLayer) process.exitCode = 1;
if (!uniformWhite) process.exitCode = 1;
if (!dash || dash.length !== 4) process.exitCode = 1;
