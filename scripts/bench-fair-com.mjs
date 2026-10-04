/**
 * Fair timing: 1 km CBD, buildings + CoM only (no Overpass roads/water/trees, no mesh).
 * Compare OSM building fetch (#37) vs Overture (#38).
 *
 * Run Overture (this branch): npx vite-node scripts/bench-fair-com.mjs
 * Run OSM baseline:           npx vite-node scripts/bench-fair-com.mjs osm
 */
import {
  clearComBuildingFootprintCache,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { execFileSync } from "node:child_process";

const mode = process.argv[2] === "osm" ? "osm" : "overture";
const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const cutBounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const comBounds = paddedComFetchBounds(center, sideM);
const layers = { buildings: true, roads: false, waterGreen: false, trees: false };

async function oneRun() {
  clearComBuildingFootprintCache();
  let buildingFetchMs = 0;
  let buildings = [];
  if (mode === "osm") {
    const worktreeRoot = "/tmp/citycut-before";
    const out = execFileSync("npx", ["vite-node", "scripts/bench-fair-com.mjs"], {
      cwd: worktreeRoot,
      encoding: "utf8",
    });
    console.log(out);
    process.exit(0);
  } else {
    const t0 = performance.now();
    const overture = await fetchOvertureBuildingsForCut(cutBounds, center, sideM);
    buildingFetchMs = performance.now() - t0;
    buildings = overture.buildings;
  }

  const comT0 = performance.now();
  const { footprints, stats: comStats } = await fetchComBuildingFootprintsWithStats(comBounds, center);
  const comFetchMs = performance.now() - comT0;

  const matchT0 = performance.now();
  await runComBuildingHeightsInWorker(buildings, footprints);
  const comMatchMs = performance.now() - matchT0;

  return {
    buildingFetchMs: Math.round(buildingFetchMs),
    comFetchMs: Math.round(comFetchMs),
    comMatchMs: Math.round(comMatchMs),
    totalMs: Math.round(buildingFetchMs + comFetchMs + comMatchMs),
    buildings: buildings.length,
    comFootprints: footprints.length,
    comRequests: comStats.requestCount,
  };
}

const runs = [];
for (let i = 0; i < 3; i++) runs.push(await oneRun());
const avg = (key) => Math.round(runs.reduce((sum, row) => sum + row[key], 0) / runs.length);

console.log(
  JSON.stringify(
    {
      mode,
      scope:
        "1 km CBD centred on −37.8136, 144.9631; buildings layer only; CoM 2023 footprint fetch + worker match; no roads/water/trees/terrain and no Three.js buildCityGroup",
      runs,
      average: {
        buildingFetchMs: avg("buildingFetchMs"),
        comFetchMs: avg("comFetchMs"),
        comMatchMs: avg("comMatchMs"),
        totalMs: avg("totalMs"),
      },
    },
    null,
    2,
  ),
);
