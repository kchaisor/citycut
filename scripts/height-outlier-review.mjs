import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "../src/lib/comDevelopmentFloors.ts";

const lat = -37.8136;
const lon = 144.9831;
const center = { lon, lat };
const sideM = 1000;
const bounds = squareBBox({ lon, lat, zoom: 15 }, sideM);
const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
const { zones } = await loadUseTiers(bounds, center);
const base = assignExternalUses(raw, zones);
const dam = await fetchDevelopmentFloorRecords(paddedComFetchBounds(center, sideM));
const mid = applyDevelopmentFloorsToBuildings(base, center, dam);
const { footprints } = await fetchComBuildingFootprintsWithStats(paddedComFetchBounds(center, sideM), center);
const { buildings: after } = applyComBuildingHeights(mid, footprints);

const flagged = [];
for (let i = 0; i < base.length; i++) {
  const before = base[i].height;
  const next = after[i].height;
  if (next > 60 || (before > 0 && next / before > 3)) {
    flagged.push({
      id: base[i].id,
      before,
      after: next,
      ratio: before > 0 ? Math.round((100 * next) / before) / 100 : null,
      zone: base[i].zoneCode,
    });
  }
}
console.log(JSON.stringify({ flaggedCount: flagged.length, flagged: flagged.slice(0, 25) }, null, 2));
