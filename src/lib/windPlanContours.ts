import { contourRings, smoothRingPasses } from "./marchingSquares";
import { LAWSON_UNSAFE_EXCEEDANCE } from "./windComfort";
import {
  windPlanContourLevels,
  type WindPlanComfort,
  type WindPlanGeometry,
  type WindPlanSpeed,
} from "./windPlanField";

export type WorldRing = Float64Array;

export const SPEED_SMOOTH_PASSES = 1;
export const COMFORT_SMOOTH_PASSES = 2;

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
const unsafeRings = new WeakMap<WindPlanComfort, WorldRing[]>();

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

export function windPlanUnsafeRings(comfort: WindPlanComfort): WorldRing[] {
  let rings = unsafeRings.get(comfort);
  if (!rings) {
    rings = worldRings(comfort.geometry, comfort.fields.p15, LAWSON_UNSAFE_EXCEEDANCE, COMFORT_SMOOTH_PASSES);
    unsafeRings.set(comfort, rings);
  }
  return rings;
}
