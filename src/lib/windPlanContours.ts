import { contourRings, smoothRing } from "./marchingSquares";
import { LAWSON_EXCEEDANCE, LAWSON_UNSAFE_EXCEEDANCE } from "./windComfort";
import {
  windPlanContourLevels,
  type WindPlanComfort,
  type WindPlanGeometry,
  type WindPlanSpeed,
} from "./windPlanField";

export type WorldRing = Float64Array;

export type ComfortBandLayer = { band: "standing" | "walking" | "uncomfortable" | "unsafe"; rings: WorldRing[] };

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

const speedContours = new WeakMap<WindPlanSpeed, Map<number, WorldRing[][]>>();
const comfortBands = new WeakMap<WindPlanComfort, ComfortBandLayer[]>();

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

export function windPlanComfortBands(comfort: WindPlanComfort): ComfortBandLayer[] {
  let layers = comfortBands.get(comfort);
  if (!layers) {
    const { geometry, fields } = comfort;
    layers = [
      { band: "standing", rings: worldRings(geometry, fields.p4, LAWSON_EXCEEDANCE) },
      { band: "walking", rings: worldRings(geometry, fields.p6, LAWSON_EXCEEDANCE) },
      { band: "uncomfortable", rings: worldRings(geometry, fields.p10, LAWSON_EXCEEDANCE) },
      { band: "unsafe", rings: worldRings(geometry, fields.p15, LAWSON_UNSAFE_EXCEEDANCE) },
    ];
    comfortBands.set(comfort, layers);
  }
  return layers;
}
