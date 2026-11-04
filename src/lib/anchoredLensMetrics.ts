import { effectiveBuildingHeightM } from "./buildingHeightResolve";
import { interiorPoint } from "./useCascade";
import { isEstimatedHeight } from "./sunStudyPlan";
import type { SunHoursGrid } from "./sunHours";
import { sunHoursAtEastNorth } from "./sunHours";
import type { BuildingFeat, CityModel } from "../types";

export const ANCHORED_LENS_FLOOR_HEIGHT_M = 3.2;

export function anchoredLensEstimatedFloors(heightM: number): number {
  if (!Number.isFinite(heightM) || heightM <= 0) return 0;
  return Math.round(heightM / ANCHORED_LENS_FLOOR_HEIGHT_M);
}

export function anchoredLensFloorsLine(heightM: number): string {
  return `${anchoredLensEstimatedFloors(heightM)} est.`;
}

export function anchoredLensHeightLine(building: BuildingFeat): string {
  const heightM = effectiveBuildingHeightM(building);
  const core = `${heightM.toFixed(1)} m`;
  return isEstimatedHeight(building) ? `${core} est.` : core;
}

export function anchoredLensSunHoursLine(
  model: CityModel,
  building: BuildingFeat,
  grid: SunHoursGrid | null | undefined,
): string | null {
  if (!grid) return null;
  const at = interiorPoint(building.ring, building.holes);
  const hours = sunHoursAtEastNorth(grid, at[0], at[1], model.sideM);
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  return `${hours.toFixed(1)} h`;
}
