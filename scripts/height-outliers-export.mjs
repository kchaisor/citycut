import { writeFileSync } from "node:fs";
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
      match_overlap_ratio: a.comMatchOverlapRatio ?? "",
      com_structure_id: a.comMatchStructureId ?? "",
      com_height_m: a.comMatchHeightM ?? "",
    });
  }
}
flagged.sort((x, y) => y.afterM - x.afterM);

function csvEscape(s) {
  const t = String(s);
  return t.includes(",") || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
}

const lines = [
  "id,name_or_address,before_m,after_m,source,match_overlap_ratio,com_structure_id,com_height_m",
];
for (const row of flagged) {
  lines.push(
    [
      row.id,
      csvEscape(row.name),
      row.beforeM.toFixed(2),
      row.afterM.toFixed(2),
      row.source,
      row.match_overlap_ratio === "" ? "" : Number(row.match_overlap_ratio).toFixed(4),
      row.com_structure_id,
      row.com_height_m === "" ? "" : Number(row.com_height_m).toFixed(2),
    ].join(","),
  );
}
const outPath = "/opt/cursor/artifacts/height-outliers.csv";
writeFileSync(outPath, lines.join("\n"));

const row645 = after.find((b) => b.id === 195697645);
console.log(
  JSON.stringify(
    {
      csv: outPath,
      flaggedCount: flagged.length,
      building195697645: row645
        ? {
            afterM: row645.height,
            source: inferHeightTier(row645),
            comMatch: {
              id: row645.comMatchStructureId,
              heightM: row645.comMatchHeightM,
              overlapRatio: row645.comMatchOverlapRatio,
            },
          }
        : null,
    },
    null,
    2,
  ),
);
