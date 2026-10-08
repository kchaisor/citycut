/**
 * List CoM structures overlapping Freemasons (551928359) with keep/drop rationale.
 */
import { squareBBox, signedArea, openRing } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  intersectionAreaM2,
  paddedComFetchBounds,
  COM_FALLBACK_MIN_FRACTION,
  COM_SLIVER_MIN_M2,
  COM_SLIVER_MIN_FRACTION,
} from "../src/lib/comBuildingHeights.ts";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "../src/lib/comDevelopmentFloors.ts";
import { inferHeightTier } from "../src/lib/buildingHeightResolve.ts";
import { buildingHeightSourceLabelForBuilding } from "../src/lib/heightOverrides.ts";

const TARGET_ID = 551928359;
const center = { lon: 144.98061, lat: -37.8127 };
const sideM = 1000;
const bounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const comBounds = paddedComFetchBounds(center, sideM);

const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
const { zones } = await loadUseTiers(bounds, center);
const zoned = assignExternalUses(raw, zones);
const dam = await fetchDevelopmentFloorRecords(comBounds);
const mid = applyDevelopmentFloorsToBuildings(zoned, center, dam);
const building = mid.find((b) => b.id === TARGET_ID);
if (!building) throw new Error("Freemasons footprint not found");

const { footprints } = await fetchComBuildingFootprintsWithStats(comBounds, center);
const osmArea = Math.abs(signedArea(openRing(building.ring)));

function isSliver(overlap, ref) {
  return overlap < COM_SLIVER_MIN_M2 || overlap < COM_SLIVER_MIN_FRACTION * ref;
}

const rows = [];
for (const fp of footprints) {
  const overlap = intersectionAreaM2(building, fp);
  if (overlap <= 0) continue;
  const comArea = Math.abs(signedArea(openRing(fp.ring)));
  const osmShare = overlap / osmArea;
  const comShare = comArea > 0 ? overlap / comArea : 0;
  let verdict = "kept for clip";
  if (isSliver(overlap, osmArea)) verdict = "dropped: sliver overlap";
  else if (osmShare < COM_FALLBACK_MIN_FRACTION && comShare < COM_FALLBACK_MIN_FRACTION) {
    verdict = "dropped: below 20% OSM and CoM share gate";
  } else if (osmShare < COM_FALLBACK_MIN_FRACTION) {
    verdict = "dropped: below 20% OSM share (CoM-dominant sliver)";
  }
  rows.push({
    id: fp.id,
    height_m: fp.height_m,
    overlap_m2: overlap,
    overlap_ratio: osmShare,
    com_share: comShare,
    verdict,
  });
}
rows.sort((a, b) => b.overlap_m2 - a.overlap_m2);

const { buildings: after } = applyComBuildingHeights(mid, footprints);
const afterB = after.find((b) => b.id === TARGET_ID);

console.log(
  JSON.stringify(
    {
      osmArea_m2: osmArea,
      beforeHeight_m: building.height,
      afterHeight_m: afterB?.height,
      afterTier: afterB ? inferHeightTier(afterB) : null,
      afterSource: afterB ? buildingHeightSourceLabelForBuilding(afterB) : null,
      extrusionPartHeights_m: afterB?.extrusionParts?.map((p) => p.height) ?? [],
      comMaxOnSite_m: rows.length ? Math.max(...rows.filter((r) => !r.verdict.startsWith("dropped")).map((r) => r.height_m)) : null,
      overlaps: rows,
    },
    null,
    2,
  ),
);
