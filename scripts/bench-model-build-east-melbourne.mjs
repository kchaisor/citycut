/**
 * Mean model-create stack for 1 km East Melbourne (3 warm runs + optional cold).
 * Matches App.tsx: CoM footprints prefetch in parallel but no worker before first model.
 * --skip-com skips CoM prefetch (main-line behaviour outside Melbourne / off).
 */
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  fetchComBuildingFootprintsWithStats,
  intersectsComCity,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
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
  const overtureTask = fetchOvertureBuildingsForCut(bounds, center, sideM);
  const zonesTask = loadUseTiers(bounds, center);
  const damTask = fetchDevelopmentFloorRecords(comBounds);
  const comTask =
    !skipCom && intersectsComCity(comBounds)
      ? fetchComBuildingFootprintsWithStats(comBounds, center)
      : Promise.resolve({ footprints: [] });
  const [{ buildings: raw }, { zones }, dam, com] = await Promise.all([
    overtureTask,
    zonesTask,
    damTask,
    comTask,
  ]);
  void com;
  const zoned = assignExternalUses(raw, zones);
  applyDevelopmentFloorsToBuildings(zoned, center, dam);
  return performance.now() - t0;
}

const runs = [];
for (let i = 0; i < 3; i++) runs.push(await oneRun());
const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
console.log(JSON.stringify({ skipCom, runsMs: runs.map((r) => Math.round(r)), meanMs: Math.round(mean) }, null, 2));
