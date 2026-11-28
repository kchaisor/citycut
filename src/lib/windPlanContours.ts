import { contourRings, smoothRingPasses } from "./marchingSquares";
import {
  windPlanContourLevels,
  type WindPlanGeometry,
  type WindPlanSpeed,
} from "./windPlanField";

export type WorldRing = Float64Array;

export const SPEED_SMOOTH_PASSES = 1;

export function worldRings(
  geometry: WindPlanGeometry,
  values: ArrayLike<number>,
  level: number,
  passes = SPEED_SMOOTH_PASSES,
): WorldRing[] {
  const { cols, rows, cellM, originE, originN } = geometry;
  return contourRings({ values, cols, rows }, level).map((ring) => {
    const smooth = smoothRingPasses(ring, passes);
    for (let k = 0; k < smooth.length; k += 2) {
      smooth[k] = originE + (smooth[k]! + 0.5) * cellM;
      smooth[k + 1] = originN + (smooth[k + 1]! + 0.5) * cellM;
    }
    return smooth;
  });
}

const speedContours = new WeakMap<WindPlanSpeed, Map<number, WorldRing[][]>>();

export function windPlanSpeedContours(speed: WindPlanSpeed, scaleMaxMs: number): WorldRing[][] {
  let byScale = speedContours.get(speed);
  if (!byScale) {
    byScale = new Map();
    speedContours.set(speed, byScale);
  }
  let rings = byScale.get(scaleMaxMs);
  if (!rings) {
    rings = windPlanContourLevels(scaleMaxMs).map((level) => worldRings(speed.geometry, speed.speedMs, level));
    byScale.set(scaleMaxMs, rings);
  }
  return rings;
}
