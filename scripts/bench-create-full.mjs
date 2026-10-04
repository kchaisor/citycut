/**
 * Full Create-model fetch path (1 km CBD, default map layers). Run: npx vite-node scripts/bench-create-full.mjs
 */
import { fetchComTrees } from "../src/lib/comTrees.ts";
import { fetchTerrainForCut } from "../src/lib/fetchTerrain.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBaseForCut } from "../src/lib/overtureBase.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { fetchOvertureTransportationForCut } from "../src/lib/overtureTransportation.ts";
import { loadContoursForCut } from "../src/lib/vicmapContours.ts";
import { fetchVicmapTrees } from "../src/lib/vicmapTrees.ts";
import { loadUseTiers } from "../src/lib/useCascade.ts";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const bounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const layers = { buildings: true, roads: true, waterGreen: true, trees: true };

async function oneRun() {
  const t0 = performance.now();
  const buildingsT = performance.now();
  const buildings = await fetchOvertureBuildingsForCut(bounds, center, sideM);
  const buildingsMs = performance.now() - buildingsT;

  const transportT = performance.now();
  const transport = await fetchOvertureTransportationForCut(bounds, center, sideM);
  const transportMs = performance.now() - transportT;

  const baseT = performance.now();
  const base = await fetchOvertureBaseForCut(bounds, center, sideM, { waterGreen: true, trees: true });
  const baseMs = performance.now() - baseT;

  const parallelT = performance.now();
  const [terrain, contours, comTrees, vicmap, zones] = await Promise.all([
    fetchTerrainForCut(center, sideM).catch(() => null),
    loadContoursForCut({ center, sideM, bounds, terrain: () => Promise.resolve(null) }).catch(() => null),
    fetchComTrees(bounds).catch(() => []),
    fetchVicmapTrees(bounds).catch(() => []),
    loadUseTiers(bounds, center).catch(() => ({ zones: null, failures: [] })),
  ]);
  const parallelMs = performance.now() - parallelT;
  const totalMs = performance.now() - t0;

  return {
    buildingsMs: Math.round(buildingsMs),
    transportMs: Math.round(transportMs),
    baseMs: Math.round(baseMs),
    parallelMs: Math.round(parallelMs),
    totalMs: Math.round(totalMs),
    buildings: buildings.stats.buildingCount,
    roads: transport.roads.length,
    roadKm: Math.round(transport.roadKm * 10) / 10,
    water: base.stats.waterCount,
    green: base.stats.greenCount,
    overtureTrees: base.stats.overtureTreeCount,
    terrain: Boolean(terrain),
    contours: Boolean(contours?.lines?.length),
    comTrees: comTrees.length,
    vicmap: vicmap.length,
    zones: zones.zones?.length ?? 0,
  };
}

const runs = [];
for (let i = 0; i < 3; i++) runs.push(await oneRun());
const avg = (k) => Math.round(runs.reduce((s, r) => s + r[k], 0) / runs.length);
console.log(
  JSON.stringify(
    {
      scope:
        "1 km CBD −37.8136, 144.9631; default map layers (buildings, roads, water/green, trees) + terrain, contours, CoM/Vicmap trees, zones; Overture PMTiles only",
      runs,
      average: {
        buildingsMs: avg("buildingsMs"),
        transportMs: avg("transportMs"),
        baseMs: avg("baseMs"),
        parallelMs: avg("parallelMs"),
        totalMs: avg("totalMs"),
      },
    },
    null,
    2,
  ),
);
