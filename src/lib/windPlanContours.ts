import { contourRings, smoothRing } from "./marchingSquares";
import { LAWSON_EXCEEDANCE, LAWSON_UNSAFE_EXCEEDANCE } from "./windComfort";
import {
  WIND_PLAN_CONTOUR_LEVELS_MS,
  type WindPlanComfort,
  type WindPlanGeometry,
  type WindPlanSpeed,
} from "./windPlanField";

export type WorldRing = Float64Array;

export type ComfortBand = "standing" | "strolling" | "walking" | "uncomfortable";

export type ComfortBandLayer = { band: ComfortBand; rings: WorldRing[] };

export type ComfortLayers = { bands: ComfortBandLayer[]; unsafe: WorldRing[] };

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
const comfortBands = new WeakMap<WindPlanComfort, ComfortLayers>();

export function windPlanSpeedContours(speed: WindPlanSpeed): WorldRing[][] {
  let rings = speedContours.get(speed);
  if (!rings) {
    rings = WIND_PLAN_CONTOUR_LEVELS_MS.map((level) => worldRings(speed.geometry, speed.speedMs, level));
    speedContours.set(speed, rings);
  }
  return rings;
}

export function windPlanComfortBands(comfort: WindPlanComfort): ComfortLayers {
  let layers = comfortBands.get(comfort);
  if (!layers) {
    const { geometry, fields } = comfort;
    layers = {
      bands: [
        { band: "standing", rings: worldRings(geometry, fields.p4, LAWSON_EXCEEDANCE) },
        { band: "strolling", rings: worldRings(geometry, fields.p6, LAWSON_EXCEEDANCE) },
        { band: "walking", rings: worldRings(geometry, fields.p8, LAWSON_EXCEEDANCE) },
        { band: "uncomfortable", rings: worldRings(geometry, fields.p10, LAWSON_EXCEEDANCE) },
      ],
      unsafe: worldRings(geometry, fields.p15, LAWSON_UNSAFE_EXCEEDANCE),
    };
    comfortBands.set(comfort, layers);
  }
  return layers;
}
