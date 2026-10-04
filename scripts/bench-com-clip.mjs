/**
 * Performance benchmark for 1 km CBD CoM heights. Run: npx vite-node scripts/bench-com-clip.mjs
 */
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import {
  applyComBuildingHeightsWithStats,
  clearComBuildingFootprintCache,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
  countBuildingsWithComDerivedExtrusion,
} from "../src/lib/comBuildingHeights.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { parseCity } from "../src/lib/parseOsm.ts";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const bounds = paddedComFetchBounds(center, sideM);
const cutBounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);

const overtureT0 = performance.now();
const overture = await fetchOvertureBuildingsForCut(cutBounds, center, sideM);
const overtureMs = performance.now() - overtureT0;
const parsed = parseCity({ elements: [] }, center, sideM, { buildings: true, roads: true, waterGreen: true, trees: false });
parsed.buildings = overture.buildings;

clearComBuildingFootprintCache();
const { footprints, stats: fetchStats } = await fetchComBuildingFootprintsWithStats(bounds, center);

const workerT0 = performance.now();
const workerResult = await runComBuildingHeightsInWorker(overture.buildings, footprints);
const workerMs = performance.now() - workerT0;

const { buildings, stats: clipStats } = applyComBuildingHeightsWithStats(overture.buildings, footprints);
const uiCount = countBuildingsWithComDerivedExtrusion(overture.buildings, workerResult.buildings);
const benchmarkCount = countBuildingsWithComDerivedExtrusion(overture.buildings, buildings);

const meshT0 = performance.now();
const group = buildCityGroup({ ...parsed, buildings: workerResult.buildings }, { splitBuildings: true });
const meshMs = performance.now() - meshT0;
disposeObject(group);

const totalMs = overtureMs + fetchStats.fetchMs + workerMs + meshMs;

console.log(
  JSON.stringify(
    {
      buildings: parsed.buildings.length,
      comFootprints: footprints.length,
      comExtrusionCount: uiCount,
      benchmarkCount,
      workerUpdated: workerResult.updated,
      syncClipMs: Math.round(clipStats.clipMs),
      fetchMs: Math.round(overtureMs + fetchStats.fetchMs),
      overtureMs: Math.round(overtureMs),
      comFetchMs: Math.round(fetchStats.fetchMs),
      workerMs: Math.round(workerMs),
      meshMs: Math.round(meshMs),
      totalMs: Math.round(totalMs),
      requestCount: fetchStats.requestCount,
      recordCount: fetchStats.recordCount,
      payloadBytes: fetchStats.payloadBytes,
      extrusionMeshCount: clipStats.extrusionMeshCount,
    },
    null,
    2,
  ),
);
