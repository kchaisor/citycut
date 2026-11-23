import type { SunHoursDirectOverlay } from "./sunHoursDirectAssess";
import type { SunHoursGroundGrid } from "./sunHoursGroundPlan";
import type { SunHoursGroundRaster } from "./sunHoursGroundRaster";
import { sunHoursRoofRasterSourceForBuildings } from "./sunHoursPicked";
import { rasterizeSunHoursRoofFromPacked } from "./sunHoursRoofPlanRaster";
import type { CityModel } from "../types";

export type SunHoursPlanLayers = {
  grid: SunHoursGroundGrid | null;
  scaleMaxHours: number;
  roofPlanRaster: SunHoursGroundRaster | null;
};

export function sunHoursPlanLayers(
  model: CityModel,
  result: { grid: SunHoursGroundGrid | null; overlay: SunHoursDirectOverlay | null; scaleMaxHours: number },
  pickedOnly: boolean,
  pickedBuildingIds: readonly number[],
): SunHoursPlanLayers {
  const { grid, overlay, scaleMaxHours } = result;
  if (!pickedOnly) return { grid, scaleMaxHours, roofPlanRaster: overlay?.roofPlanRaster ?? null };
  const source = overlay?.roofRasterSource
    ? sunHoursRoofRasterSourceForBuildings(overlay.roofRasterSource, pickedBuildingIds)
    : null;
  return {
    grid: null,
    scaleMaxHours,
    roofPlanRaster: source ? rasterizeSunHoursRoofFromPacked(model, source, scaleMaxHours || overlay!.maxSunHours) : null,
  };
}
