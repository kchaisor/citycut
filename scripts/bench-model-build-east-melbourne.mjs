/**
 * Mean building-stack time for 1 km East Melbourne (3 runs).
 * --skip-com simulates main (no CoM fetch/match at create).
 */
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  intersectsComCity,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import {
  applyDevelopmentFloorsToBuildings,
  fetchDevelopmentFloorRecords,
} from "../src/lib/comDevelopmentFloors.ts";

const skipCom = process.argv.includes("--skip-com");
const center = { lon: 144.98061, lat: -37.8127 };
const sideM = 1000;
const bounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const comBounds = paddedComFetchBounds(center, sideM);

async function oneRun() {
  const t0 = performance.now();
  const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
  const { zones } = await loadUseTiers(bounds, center);
  const zoned = assignExternalUses(raw, zones);
  let withCom = zoned;
  if (!skipCom && intersectsComCity(comBounds)) {
    const { footprints } = await fetchComBuildingFootprintsWithStats(comBounds, center);
    const matched = await runComBuildingHeightsInWorker(zoned, footprints);
    withCom = matched.buildings;
  }
  const dam = await fetchDevelopmentFloorRecords(comBounds);
  applyDevelopmentFloorsToBuildings(withCom, center, dam);
  return performance.now() - t0;
}

const runs = [];
for (let i = 0; i < 3; i++) runs.push(await oneRun());
const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
console.log(JSON.stringify({ skipCom, runsMs: runs.map((r) => Math.round(r)), meanMs: Math.round(mean) }, null, 2));
