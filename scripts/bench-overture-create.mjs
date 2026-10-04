/**
 * Overture building path timing (1 km CBD, 3 runs). Skips Overpass when it is down.
 */
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import {
  clearComBuildingFootprintCache,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { parseCity } from "../src/lib/parseOsm.ts";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const cutBounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const comBounds = paddedComFetchBounds(center, sideM);
const layers = { buildings: true, roads: true, waterGreen: true, trees: false };

async function oneRun() {
  const fetchT0 = performance.now();
  const [overture, comFetch] = await Promise.all([
    fetchOvertureBuildingsForCut(cutBounds, center, sideM),
    (async () => {
      clearComBuildingFootprintCache();
      return fetchComBuildingFootprintsWithStats(comBounds, center);
    })(),
  ]);
  const fetchMs = performance.now() - fetchT0;
  const parsed = parseCity({ elements: [] }, center, sideM, layers);
  const buildings = overture.buildings;
  const matchT0 = performance.now();
  const workerResult = await runComBuildingHeightsInWorker(buildings, comFetch.footprints);
  const matchMs = performance.now() - matchT0;
  const buildT0 = performance.now();
  const group = buildCityGroup({ ...parsed, buildings: workerResult.buildings }, { splitBuildings: true });
  const buildMs = performance.now() - buildT0;
  disposeObject(group);
  return {
    fetchMs: Math.round(fetchMs),
    matchMs: Math.round(matchMs),
    buildMs: Math.round(buildMs),
    totalMs: Math.round(fetchMs + matchMs + buildMs),
    overtureMs: Math.round(overture.stats.fetchMs),
    comFetchMs: Math.round(comFetch.stats.fetchMs),
    buildings: buildings.length,
    release: overture.stats.release,
  };
}

const runs = [];
for (let i = 0; i < 3; i++) runs.push(await oneRun());
const avg = (key) => Math.round(runs.reduce((sum, row) => sum + row[key], 0) / runs.length);
console.log(JSON.stringify({ runs, average: { fetchMs: avg("fetchMs"), matchMs: avg("matchMs"), buildMs: avg("buildMs"), totalMs: avg("totalMs") } }, null, 2));
