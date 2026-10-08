/**
 * Census by final height tier with CoM applied at model create (Melbourne crops).
 * Usage: npm exec vite-node scripts/height-tier-census.mjs -- --lat=-37.8127 --lon=144.98061 --km=1
 */
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import {
  applyDevelopmentFloorsToBuildings,
  applyDevelopmentFloorsToBuildingsLegacy,
  countDamMultiBuildingAssignments,
  fetchDevelopmentFloorRecords,
} from "../src/lib/comDevelopmentFloors.ts";
import { inferHeightTier } from "../src/lib/buildingHeightResolve.ts";

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
const comBounds = paddedComFetchBounds(center, sideM);

const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
const { zones } = await loadUseTiers(bounds, center);
const zoned = assignExternalUses(raw, zones);
const { footprints } = await fetchComBuildingFootprintsWithStats(comBounds, center);
const dam = await fetchDevelopmentFloorRecords(comBounds);

function tierCounts(buildings) {
  const counts = {
    manual: 0,
    com: 0,
    overture_height: 0,
    overture_floors: 0,
    development_floors: 0,
    osm_levels: 0,
    zone_default: 0,
  };
  for (const b of buildings) {
    counts[inferHeightTier(b)] += 1;
  }
  return counts;
}

const before = tierCounts(zoned);
const damLegacy = applyDevelopmentFloorsToBuildingsLegacy(zoned, center, dam);
const damWinnerOnly = applyDevelopmentFloorsToBuildings(zoned, center, dam);
const { buildings: afterComDam } = applyComBuildingHeights(damWinnerOnly, footprints);

const damMultiBefore = countDamMultiBuildingAssignments(zoned, center, dam, "legacy");
const damMultiAfter = countDamMultiBuildingAssignments(zoned, center, dam, "winner");

console.log(
  JSON.stringify(
    {
      crop: { lat, lon, km },
      tierCounts: {
        beforeZonesOnly: before,
        afterComAndDamWinner: tierCounts(afterComDam),
      },
      damMultiBuildingRecords: {
        legacyAssign: damMultiBefore.recordsWithMultipleBuildings,
        winnerAssign: damMultiAfter.recordsWithMultipleBuildings,
      },
      damOnlyWinnerTiers: tierCounts(damWinnerOnly),
      note: "afterComAndDamWinner mirrors App create order: zones → CoM → DAM winner",
    },
    null,
    2,
  ),
);
