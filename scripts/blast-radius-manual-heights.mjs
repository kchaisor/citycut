/**
 * Blast-radius proof: zero manual overrides → same building heights and mesh bounds.
 * Run: npx vite-node scripts/blast-radius-manual-heights.mjs
 */
import * as THREE from "three";
import { applyHeightOverrides, buildingHeightsFingerprint, clearAllHeightOverrides } from "../src/lib/heightOverrides.ts";
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";

const origin = { lon: 144.9631, lat: -37.8136 };

function square(center, size) {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

const buildings = [
  {
    id: 1,
    ring: square([0, 0], 40),
    holes: [],
    height: 12,
    use: "unclassified",
    source: "none",
    overtureId: "gers:demo",
  },
  {
    id: 2,
    ring: square([50, 0], 36),
    holes: [],
    height: 9,
    use: "commercial",
    source: "osm_tag",
    extrusionParts: [{ ring: square([50, 0], 20), holes: [], height: 28 }],
  },
];

const model = {
  placeLabel: "CBD sample",
  center: origin,
  sideM: 600,
  layers: { buildings: true, roads: false, waterGreen: false, trees: false },
  buildings,
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "test",
  comBuildingHeights: true,
};

const empty = clearAllHeightOverrides();
const applied = applyHeightOverrides(buildings, empty, origin);
const fpMatch = buildingHeightsFingerprint(applied.buildings) === buildingHeightsFingerprint(buildings);

const t0 = performance.now();
const baselineGroup = buildCityGroup(model, { splitBuildings: true });
const baselineMs = performance.now() - t0;
const baselineBox = new THREE.Box3().setFromObject(baselineGroup);
disposeObject(baselineGroup);

const t1 = performance.now();
const pipelineGroup = buildCityGroup({ ...model, buildings: applied.buildings }, { splitBuildings: true });
const pipelineMs = performance.now() - t1;
const pipelineBox = new THREE.Box3().setFromObject(pipelineGroup);
disposeObject(pipelineGroup);

const boundsMatch =
  Math.abs(baselineBox.max.y - pipelineBox.max.y) < 1e-4 &&
  Math.abs(baselineBox.min.y - pipelineBox.min.y) < 1e-4;

console.log(
  JSON.stringify(
    {
      fingerprintMatch: fpMatch,
      meshBoundsMatch: boundsMatch,
      baselineBuildMs: Math.round(baselineMs),
      withOverridePipelineBuildMs: Math.round(pipelineMs),
      deltaMs: Math.round(pipelineMs - baselineMs),
    },
    null,
    2,
  ),
);

if (!fpMatch || !boundsMatch) process.exit(1);
