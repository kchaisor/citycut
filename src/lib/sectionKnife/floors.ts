import { STOREY_HEIGHT_M } from "../buildingHeightResolve";
import type { BuildingFeat } from "../../types";

export type SectionFloorLine = {
  yM: number;
  estimated: boolean;
};

export function floorLinesForBuilding(building: BuildingFeat, baseYM: number, topYM: number): SectionFloorLine[] {
  const height = Math.max(0, topYM - baseYM);
  if (height < 0.5) return [];
  let count: number | null = null;
  let estimated = true;
  if (building.developmentFloors != null && building.developmentFloors > 0) {
    count = building.developmentFloors;
    estimated = false;
  } else if (building.numFloors != null && building.numFloors > 0) {
    count = building.numFloors;
    estimated = building.heightTier !== "overture_floors" && building.heightTier !== "development_floors";
  } else if (building.heightTier === "osm_levels") {
    count = Math.max(1, Math.round(height / STOREY_HEIGHT_M));
    estimated = false;
  } else {
    count = Math.max(1, Math.round(height / STOREY_HEIGHT_M));
    estimated = true;
  }
  const lines: SectionFloorLine[] = [];
  for (let level = 1; level < count; level++) {
    const yM = baseYM + level * STOREY_HEIGHT_M;
    if (yM >= topYM - 0.05) break;
    lines.push({ yM, estimated });
  }
  return lines;
}
