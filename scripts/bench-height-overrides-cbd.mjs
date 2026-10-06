/**
 * CBD frame: cost of applyHeightOverrides with an empty store.
 * Run: npx vite-node scripts/bench-height-overrides-cbd.mjs
 */
import { applyHeightOverrides, clearAllHeightOverrides } from "../src/lib/heightOverrides.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import {
  clearComBuildingFootprintCache,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { squareBBox } from "../src/lib/geo.ts";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 600;
const cutBounds = squareBBox(center, sideM);
const bounds = paddedComFetchBounds(center, sideM);

const { buildings } = await fetchOvertureBuildingsForCut(cutBounds, center, sideM);
clearComBuildingFootprintCache();
const { footprints } = await fetchComBuildingFootprintsWithStats(bounds, center);
const workerResult = await runComBuildingHeightsInWorker(buildings, footprints);
const frameBuildings = workerResult.buildings;

const empty = clearAllHeightOverrides();
const runs = 5;
let total = 0;
for (let i = 0; i < runs; i++) {
  const t0 = performance.now();
  applyHeightOverrides(frameBuildings, empty, center);
  total += performance.now() - t0;
}

console.log(
  JSON.stringify(
    {
      frame: "CBD 0.6 km",
      buildings: frameBuildings.length,
      applyOverridesEmptyStoreAvgMs: Math.round(total / runs),
    },
    null,
    2,
  ),
);
