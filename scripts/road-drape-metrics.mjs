/**
 * Road vs terrain-mesh clearance and buildCityGroup times.
 * Usage: node --experimental-strip-types scripts/road-drape-metrics.mjs [label]
 */
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import { fetchTerrainForCut } from "../src/lib/fetchTerrain.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureTransportationForCut } from "../src/lib/overtureTransportation.ts";
import { parseCity } from "../src/lib/parseOsm.ts";
import { drapedRoadTerrainMetrics } from "../src/lib/roadTerrainMetrics.ts";

const label = process.argv[2] ?? "branch";

async function measureFrame(name, center, sideM) {
  const bounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
  const layers = { buildings: false, roads: true, waterGreen: false, trees: false };
  const [transport, terrain] = await Promise.all([
    fetchOvertureTransportationForCut(bounds, center, sideM),
    fetchTerrainForCut(center, sideM),
  ]);
  const parsed = parseCity({ elements: [] }, center, sideM, layers);
  const model = {
    ...parsed,
    roads: transport.roads,
    terrain,
    areas: [],
    buildings: [],
    roadKm: transport.roadKm,
  };
  const t0 = performance.now();
  const group = buildCityGroup(model);
  const buildMs = performance.now() - t0;
  const stats = drapedRoadTerrainMetrics(group, terrain, sideM);
  disposeObject(group);
  return {
    name,
    center,
    sideM,
    buildMs: Math.round(buildMs * 10) / 10,
    roadCount: transport.roads.length,
    deckCount: transport.roads.filter((road) => road.deck).length,
    spacingM: terrain.spacingM,
    ...stats,
  };
}

const mcg = await measureFrame("mcg-1km", { lon: 144.988, lat: -37.8235 }, 1000);
const cbd = await measureFrame("cbd-1km", { lon: 144.9631, lat: -37.8136 }, 1000);
const largest = await measureFrame("cbd-1.4km", { lon: 144.9631, lat: -37.8136 }, 1400);

const out = { label, mcg, cbd, largest };
console.log(JSON.stringify(out, null, 2));
