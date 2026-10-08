import { squareBBox, signedArea, openRing } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  intersectionAreaM2,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "../src/lib/comDevelopmentFloors.ts";
import { inferHeightTier } from "../src/lib/buildingHeightResolve.ts";

const id = 195697645;
const center = { lon: 144.9831, lat: -37.8136 };
const sideM = 1000;
const bounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
const { zones } = await loadUseTiers(bounds, center);
const before = assignExternalUses(raw, zones);
const b0 = before.find((b) => b.id === id);
const dam = await fetchDevelopmentFloorRecords(paddedComFetchBounds(center, sideM));
const mid = applyDevelopmentFloorsToBuildings(before, center, dam);
const { footprints } = await fetchComBuildingFootprintsWithStats(paddedComFetchBounds(center, sideM), center);
const { buildings: after } = applyComBuildingHeights(mid, footprints);
const b = after.find((x) => x.id === id);
const area = Math.abs(signedArea(openRing(b0.ring)));
let best = { overlap: 0, id: "", h: 0 };
for (const fp of footprints) {
  const overlap = intersectionAreaM2(b0, fp);
  if (overlap > best.overlap) {
    best = { overlap, id: fp.id, h: fp.height_m };
  }
}
console.log(
  JSON.stringify(
    {
      before: { height: b0?.height, tier: inferHeightTier(b0), numFloors: b0?.numFloors, fallback: b0?.heightFromFallback },
      after: {
        height: b?.height,
        tier: inferHeightTier(b),
        heightTier: b?.heightTier,
        parts: b?.extrusionParts?.map((p) => p.height),
        maxPart: b?.extrusionParts ? Math.max(...b.extrusionParts.map((p) => p.height)) : null,
      },
      bestOverlap: { ...best, ratio: best.overlap / area },
      osmArea: area,
    },
    null,
    2,
  ),
);
