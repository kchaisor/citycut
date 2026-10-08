import { writeFileSync } from "node:fs";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  intersectionAreaM2,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import {
  applyDevelopmentFloorsToBuildings,
  fetchDevelopmentFloorRecords,
} from "../src/lib/comDevelopmentFloors.ts";
import { inferHeightTier } from "../src/lib/buildingHeightResolve.ts";

const lat = -37.8136;
const lon = 144.9831;
const center = { lon, lat };
const sideM = 1000;
const bounds = squareBBox({ lon, lat, zoom: 15 }, sideM);
const comBounds = paddedComFetchBounds(center, sideM);

const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
const { zones } = await loadUseTiers(bounds, center);
const before = assignExternalUses(raw, zones);
const dam = await fetchDevelopmentFloorRecords(comBounds);
const { footprints } = await fetchComBuildingFootprintsWithStats(comBounds, center);
const mid = applyDevelopmentFloorsToBuildings(before, center, dam);
const { buildings: after } = applyComBuildingHeights(mid, footprints);

const flagged = [];
for (let i = 0; i < before.length; i++) {
  const b = before[i];
  const a = after[i];
  if (a.height > 60 || (b.height > 0 && a.height / b.height > 3)) {
    flagged.push({
      id: b.id,
      name: b.overtureName ?? "",
      beforeM: b.height,
      afterM: a.height,
      source: inferHeightTier(a),
    });
  }
}
flagged.sort((x, y) => y.afterM - x.afterM);

function csvEscape(s) {
  const t = String(s);
  return t.includes(",") || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
}

const lines = ["id,name_or_address,before_m,after_m,source"];
for (const row of flagged) {
  lines.push(
    [row.id, csvEscape(row.name), row.beforeM.toFixed(2), row.afterM.toFixed(2), row.source].join(","),
  );
}
const outPath = "/opt/cursor/artifacts/height-outliers.csv";
writeFileSync(outPath, lines.join("\n"));

const top3 = flagged.slice(0, 3);
const spot = [];
for (const row of top3) {
  const building = after.find((b) => b.id === row.id);
  let maxCom = 0;
  let comId = "";
  if (building) {
    for (const fp of footprints) {
      const overlap = intersectionAreaM2(building, fp);
      if (overlap > 0 && fp.height_m > maxCom) {
        maxCom = fp.height_m;
        comId = fp.id;
      }
    }
  }
  spot.push({
    id: row.id,
    afterM: row.afterM,
    maxOverlappingComExtrusionM: maxCom,
    comStructureId: comId,
    plausible: maxCom > 0 ? Math.abs(maxCom - row.afterM) < 8 || row.afterM <= maxCom + 1 : null,
  });
}

console.log(JSON.stringify({ csv: outPath, flaggedCount: flagged.length, top3SpotCheck: spot }, null, 2));
