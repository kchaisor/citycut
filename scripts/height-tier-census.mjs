/**
 * Census: buildings on zone default with CoM overlap or DAM floor records.
 * Usage: npm exec vite-node scripts/height-tier-census.mjs [--lat=] [--lon=] [--km=1]
 */
import { signedArea, openRing, squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import {
  applyDevelopmentFloorsToBuildings,
  fetchDevelopmentFloorRecords,
  matchDevelopmentFloorsToBuilding,
} from "../src/lib/comDevelopmentFloors.ts";
import { buildingHasComOverlap } from "../src/lib/buildingHeightResolve.ts";

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

const lat = Number(parseArg("lat", "-37.8127"));
const lon = Number(parseArg("lon", "144.98061"));
const km = Number(parseArg("km", "1"));
const center = { lon, lat };
const sideM = km * 1000;
const bounds = squareBBox({ lon, lat, zoom: 15 }, sideM);

const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
const { zones } = await loadUseTiers(bounds, center);
const base = assignExternalUses(raw, zones);
const { footprints } = await fetchComBuildingFootprintsWithStats(paddedComFetchBounds(center, sideM), center);
const dam = await fetchDevelopmentFloorRecords(paddedComFetchBounds(center, sideM));

function census(buildings) {
  let zoneDefault = 0;
  let zoneWithComOverlap = 0;
  let zoneWithDamFloors = 0;
  for (const b of buildings) {
    if (!b.heightFromFallback) continue;
    zoneDefault += 1;
    if (footprints.length && buildingHasComOverlap(b, footprints)) zoneWithComOverlap += 1;
    if (matchDevelopmentFloorsToBuilding(b, center, dam) != null) zoneWithDamFloors += 1;
  }
  return { buildings: buildings.length, zoneDefault, zoneWithComOverlap, zoneWithDamFloors };
}

const beforeDam = census(base);
const damApplied = applyDevelopmentFloorsToBuildings(base, center, dam);
const afterDam = census(damApplied);
const { buildings: comApplied } = applyComBuildingHeights(damApplied, footprints);
const afterCom = census(comApplied);

console.log(
  JSON.stringify(
    {
      crop: { lat, lon, km },
      before: beforeDam,
      afterDamOnly: afterDam,
      afterDamAndCom: afterCom,
    },
    null,
    2,
  ),
);
