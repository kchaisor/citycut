import { contourRings, smoothRing } from "./marchingSquares";
import { LAWSON_UNSAFE_EXCEEDANCE } from "./windComfort";
import {
  WIND_PLAN_CONTOUR_LEVELS_MS,
  type WindPlanComfort,
  type WindPlanGeometry,
  type WindPlanSpeed,
} from "./windPlanField";

export type WorldRing = Float64Array;

export function worldRings(geometry: WindPlanGeometry, values: ArrayLike<number>, level: number): WorldRing[] {
  const { cols, rows, cellM, originE, originN } = geometry;
  return contourRings({ values, cols, rows }, level).map((ring) => {
    const smooth = smoothRing(ring);
    for (let k = 0; k < smooth.length; k += 2) {
      smooth[k] = originE + (smooth[k]! + 0.5) * cellM;
      smooth[k + 1] = originN + (smooth[k + 1]! + 0.5) * cellM;
    }
    return smooth;
  });
}

const speedContours = new WeakMap<WindPlanSpeed, WorldRing[][]>();
const unsafeRings = new WeakMap<WindPlanComfort, WorldRing[]>();

export function windPlanSpeedContours(speed: WindPlanSpeed): WorldRing[][] {
  let rings = speedContours.get(speed);
  if (!rings) {
    rings = WIND_PLAN_CONTOUR_LEVELS_MS.map((level) => worldRings(speed.geometry, speed.speedMs, level));
    speedContours.set(speed, rings);
  }
  return rings;
}

export function windPlanUnsafeRings(comfort: WindPlanComfort): WorldRing[] {
  let rings = unsafeRings.get(comfort);
  if (!rings) {
    rings = worldRings(comfort.geometry, comfort.fields.p15, LAWSON_UNSAFE_EXCEEDANCE);
    unsafeRings.set(comfort, rings);
  }
  return rings;
}
