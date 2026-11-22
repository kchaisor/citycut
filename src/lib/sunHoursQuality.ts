import type { RenderQuality } from "./renderQuality";
import { SUN_HOURS_GROUND_CELL_M, SUN_HOURS_GROUND_STEP_MINUTES } from "./sunHoursGround";

export const SUN_HOURS_HIGH_CELL_M = 1;
export const SUN_HOURS_HIGH_STEP_MINUTES = 5;
export const SUN_HOURS_HIGH_EASED_CELLS_M = [1.5, 2] as const;
export const SUN_HOURS_HIGH_MAX_GROUND_CELLS = 250_000;
export const SUN_HOURS_FAST_WALL_SAMPLE_CAP = 48_000;
export const SUN_HOURS_HIGH_WALL_SAMPLE_CAP = 52_000;
export const SUN_HOURS_HIGH_ROOF_SAMPLE_CAP = 24_000;
export const SUN_HOURS_MAX_WALL_CELL_M = SUN_HOURS_GROUND_CELL_M * 4;
export const SUN_HOURS_DENSE_CUT_BUILDINGS = 120;

export type SunHoursQualityParams = {
  quality: RenderQuality;
  cellM: number;
  stepMinutes: number;
  targetCellM: number;
  degraded: boolean;
  wallSampleCap: number;
  roofSampleCap: number;
  wallCellM: number;
  denseCutWallCellM: number;
};

export type SunHoursResolution = Pick<SunHoursQualityParams, "cellM" | "stepMinutes" | "targetCellM" | "degraded">;

export const FAST_SUN_HOURS_RESOLUTION: SunHoursResolution = {
  cellM: SUN_HOURS_GROUND_CELL_M,
  stepMinutes: SUN_HOURS_GROUND_STEP_MINUTES,
  targetCellM: SUN_HOURS_GROUND_CELL_M,
  degraded: false,
};

export function sunHoursGroundCellCount(sideM: number, cellM: number): number {
  const perSide = Math.max(1, Math.ceil(sideM / cellM - 1e-6));
  return perSide * perSide;
}

function highCellM(sideM: number): number {
  for (const cellM of [SUN_HOURS_HIGH_CELL_M, ...SUN_HOURS_HIGH_EASED_CELLS_M]) {
    if (sunHoursGroundCellCount(sideM, cellM) <= SUN_HOURS_HIGH_MAX_GROUND_CELLS) return cellM;
  }
  return SUN_HOURS_HIGH_EASED_CELLS_M[SUN_HOURS_HIGH_EASED_CELLS_M.length - 1];
}

export function sunHoursQualityParams(quality: RenderQuality, sideM: number): SunHoursQualityParams {
  if (quality === "fast") {
    return {
      quality,
      ...FAST_SUN_HOURS_RESOLUTION,
      wallSampleCap: SUN_HOURS_FAST_WALL_SAMPLE_CAP,
      roofSampleCap: Infinity,
      wallCellM: SUN_HOURS_GROUND_CELL_M,
      denseCutWallCellM: SUN_HOURS_GROUND_CELL_M * 2,
    };
  }
  const cellM = highCellM(sideM);
  return {
    quality,
    cellM,
    stepMinutes: SUN_HOURS_HIGH_STEP_MINUTES,
    targetCellM: SUN_HOURS_HIGH_CELL_M,
    degraded: cellM !== SUN_HOURS_HIGH_CELL_M,
    wallSampleCap: SUN_HOURS_HIGH_WALL_SAMPLE_CAP,
    roofSampleCap: SUN_HOURS_HIGH_ROOF_SAMPLE_CAP,
    wallCellM: cellM,
    denseCutWallCellM: cellM,
  };
}

export function sunHoursResolution(params: SunHoursQualityParams): SunHoursResolution {
  const { cellM, stepMinutes, targetCellM, degraded } = params;
  return { cellM, stepMinutes, targetCellM, degraded };
}

export function sunHoursStartWallCellM(params: SunHoursSampleParams, buildingCount: number): number {
  return buildingCount > SUN_HOURS_DENSE_CUT_BUILDINGS ? params.denseCutWallCellM : params.wallCellM;
}

export type SunHoursSampleParams = Pick<
  SunHoursQualityParams,
  "cellM" | "stepMinutes" | "wallSampleCap" | "roofSampleCap" | "wallCellM" | "denseCutWallCellM"
>;

export const FAST_SUN_HOURS_PARAMS: SunHoursQualityParams = sunHoursQualityParams("fast", 0);
