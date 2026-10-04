/**
 * CoM-updated building count on 1 km CBD: OSM (#37) vs Overture (#38).
 * Run: npx vite-node scripts/com-count-compare.mjs
 */
import {
  countBuildingsWithComDerivedExtrusion,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { execFileSync } from "node:child_process";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const cutBounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const comBounds = paddedComFetchBounds(center, sideM);
const layers = { buildings: true, roads: false, waterGreen: false, trees: false };

async function countFor(buildings) {
  const { footprints } = await fetchComBuildingFootprintsWithStats(comBounds, center);
  const { buildings: after } = await runComBuildingHeightsInWorker(buildings, footprints);
  return {
    buildings: buildings.length,
    comUpdated: countBuildingsWithComDerivedExtrusion(buildings, after),
  };
}

const overture = await fetchOvertureBuildingsForCut(cutBounds, center, sideM);
const overtureCount = await countFor(overture.buildings);

const worktreeRoot = "/tmp/citycut-before";
const osmJson = execFileSync("npx", ["vite-node", "scripts/com-count-cbd.mjs"], {
  cwd: worktreeRoot,
  encoding: "utf8",
});
const osmCount = JSON.parse(osmJson.trim());

console.log(JSON.stringify({ cbd_1km: { osm_baseline_37: osmCount, overture_38: overtureCount } }, null, 2));
