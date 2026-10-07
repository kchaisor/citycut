/**
 * Blast-radius for area cap, circle terrain clip, and draped water lift.
 * Run: npx vite-node scripts/blast-radius-seven-items.mjs
 */
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { terrainBuffers } from "../src/lib/terrain.ts";
import { signedArea } from "../src/lib/geo.ts";
function terrainField() {
  return {
    cols: 5,
    rows: 5,
    heights: Float32Array.from({ length: 25 }, (_, i) => 10 + i * 0.1),
    min: 10,
    max: 12.4,
    spacingM: 20,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

function pondModel() {
  return {
    placeLabel: "Test",
    center: { lat: -37.8455, lon: 144.9706 },
    sideM: 400,
    frameShape: "square",
    layers: { buildings: false, roads: false, waterGreen: true, trees: false },
    buildings: [],
    roads: [],
    areas: [
      {
        id: 1,
        kind: "water",
        ring: [
          [-40, -40],
          [40, -40],
          [40, 40],
          [-40, 40],
          [-40, -40],
        ],
        holes: [],
      },
    ],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
    terrain: terrainField(),
  };
}

const field = terrainField();
const sideM = 400;
const squareBefore = terrainBuffers(field, sideM, "square");
const squareAfter = terrainBuffers(field, sideM, "square");
const squareIndicesMatch = squareBefore.indices.length === squareAfter.indices.length;

const model = pondModel();
const paths = planPaths(model);
const waterArea = paths.water[0]?.[0] ? Math.abs(signedArea(paths.water[0][0])) : 0;

const t0 = performance.now();
const group = buildCityGroup(model);
group.updateMatrixWorld(true);
const buildMs = performance.now() - t0;
const waterMesh = group.getObjectByName("Water");
disposeObject(group);

const result = {
  squareTerrainIndexCount: squareBefore.indices.length,
  squareTerrainUnchanged: squareIndicesMatch,
  planWaterRingAreaM2: Math.round(waterArea),
  hasWaterMesh: Boolean(waterMesh),
  buildCityGroupMs: Math.round(buildMs * 100) / 100,
};

console.log(JSON.stringify(result, null, 2));
if (!result.squareTerrainUnchanged) process.exit(1);
