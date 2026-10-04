/**
 * Create model timing for 1 km CBD. Run: npx vite-node scripts/bench-create-model.mjs
 */
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import {
  applyComBuildingHeightsWithStats,
  clearComBuildingFootprintCache,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { fetchOvertureBaseForCut } from "../src/lib/overtureBase.ts";
import { fetchOvertureTransportationForCut } from "../src/lib/overtureTransportation.ts";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const bounds = paddedComFetchBounds(center, sideM);
const cutBounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const layers = { buildings: true, roads: true, waterGreen: true, trees: false };

async function oneRun() {
  const overtureT0 = performance.now();
  const [overture, transport, base] = await Promise.all([
    fetchOvertureBuildingsForCut(cutBounds, center, sideM),
    fetchOvertureTransportationForCut(cutBounds, center, sideM),
    fetchOvertureBaseForCut(cutBounds, center, sideM, { waterGreen: true, trees: false }),
  ]);
  const overtureMs = performance.now() - overtureT0;

  const buildings = overture.buildings;
  void transport;
  void base;

  clearComBuildingFootprintCache();
  const { footprints, stats: fetchStats } = await fetchComBuildingFootprintsWithStats(bounds, center);

  const matchT0 = performance.now();
  const workerResult = await runComBuildingHeightsInWorker(buildings, footprints);
  const matchMs = performance.now() - matchT0;

  const buildT0 = performance.now();
  const group = buildCityGroup({ ...parsed, buildings: workerResult.buildings }, { splitBuildings: true });
  const buildMs = performance.now() - buildT0;
  disposeObject(group);

  applyComBuildingHeightsWithStats(buildings, footprints);

  return {
    fetchMs: Math.round(overtureMs + fetchStats.fetchMs),
    overtureMs: Math.round(overtureMs),
    comFetchMs: Math.round(fetchStats.fetchMs),
    matchMs: Math.round(matchMs),
    buildMs: Math.round(buildMs),
    totalMs: Math.round(overtureMs + fetchStats.fetchMs + matchMs + buildMs),
    buildings: buildings.length,
    release: overture.stats.release,
  };
}

const runs = [];
for (let i = 0; i < 3; i++) runs.push(await oneRun());
const avg = (key) => Math.round(runs.reduce((sum, row) => sum + row[key], 0) / runs.length);
console.log(JSON.stringify({ runs, average: {
  fetchMs: avg("fetchMs"),
  matchMs: avg("matchMs"),
  buildMs: avg("buildMs"),
  totalMs: avg("totalMs"),
  overtureMs: avg("overtureMs"),
  comFetchMs: avg("comFetchMs"),
}}, null, 2));
