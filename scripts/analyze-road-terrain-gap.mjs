/**
 * Road vs terrain mesh clearance stats for MCG 1 km frame.
 * Run on main and branch: npx vite-node scripts/analyze-road-terrain-gap.mjs [label]
 */
import * as THREE from "three";
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import { fetchTerrainForCut } from "../src/lib/fetchTerrain.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureTransportationForCut } from "../src/lib/overtureTransportation.ts";
import { parseCity } from "../src/lib/parseOsm.ts";
import { arterialRoadTerrainMetrics } from "../src/lib/roadTerrainMetrics.ts";

const label = process.argv[2] ?? "branch";
const center = { lon: 144.988, lat: -37.8235 };
const sideM = 1000;
const bounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const layers = { buildings: true, roads: true, waterGreen: false, trees: false };
function analyzeGroup(group, field, sideM) {
  const terrainMesh = group.getObjectByName("Terrain");
  if (!terrainMesh?.isMesh) throw new Error("Terrain mesh missing");
  const raycaster = new THREE.Raycaster();
  const stats = arterialRoadTerrainMetrics(group, field, sideM, raycaster, terrainMesh);
  return {
    label,
    ...stats,
    terrainSpacingM: field.spacingM,
  };
}

const transport = await fetchOvertureTransportationForCut(bounds, center, sideM);
const terrain = await fetchTerrainForCut(center, sideM);
if (!terrain) throw new Error("terrain fetch failed");
const parsed = parseCity({ elements: [] }, center, sideM, layers);
const model = {
  ...parsed,
  roads: transport.roads,
  terrain,
  areas: [],
  buildings: [],
};

const group = buildCityGroup(model);
const stats = analyzeGroup(group, terrain, sideM);
disposeObject(group);
console.log(JSON.stringify(stats, null, 2));
