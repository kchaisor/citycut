import { SUN_HOURS_GROUND_CELL_M, sunHoursGroundRgba } from "./sunHoursGround";
import type { SunHoursGroundRaster } from "./sunHoursGroundRaster";
import type { DirectSunHoursSample } from "./sunHoursDirectSample";
import type { CityModel } from "../types";

export type SunHoursRoofRasterSource = {
  east: Float32Array;
  north: Float32Array;
  hours: Float32Array;
  spanM: number;
};

export function packSunHoursRoofRasterSource(
  samples: DirectSunHoursSample[],
  hours: Float32Array,
): SunHoursRoofRasterSource | null {
  const east: number[] = [];
  const north: number[] = [];
  const packedHours: number[] = [];
  let spanM = SUN_HOURS_GROUND_CELL_M;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    if (sample.kind !== "roof-cell") continue;
    east.push(sample.east);
    north.push(sample.north);
    packedHours.push(hours[index]!);
    spanM = sample.spanM;
  }
  if (east.length === 0) return null;
  return {
    east: new Float32Array(east),
    north: new Float32Array(north),
    hours: new Float32Array(packedHours),
    spanM,
  };
}

export function rasterizeSunHoursRoofFromPacked(
  model: CityModel,
  source: SunHoursRoofRasterSource,
  scaleMaxHours: number,
): SunHoursGroundRaster | null {
  if (scaleMaxHours <= 0 || typeof document === "undefined") return null;
  const samples: DirectSunHoursSample[] = [];
  const hours = source.hours;
  for (let index = 0; index < source.east.length; index++) {
    samples.push({
      id: `roof-pack-${index}`,
      kind: "roof-cell",
      buildingId: 0,
      east: source.east[index]!,
      north: source.north[index]!,
      yM: 0,
      outwardEast: 0,
      outwardNorth: 0,
      spanM: source.spanM,
    });
  }
  return rasterizeSunHoursRoofPlan(model, samples, hours, scaleMaxHours);
}

export function rasterizeSunHoursRoofPlan(
  model: CityModel,
  samples: DirectSunHoursSample[],
  hours: Float32Array,
  scaleMaxHours: number,
): SunHoursGroundRaster | null {
  if (scaleMaxHours <= 0 || typeof document === "undefined") return null;
  const cellM = SUN_HOURS_GROUND_CELL_M;
  const half = model.sideM / 2;
  const cols = Math.max(1, Math.ceil(model.sideM / cellM));
  const rows = cols;
  const originEast = -half;
  const originNorth = -half;
  const widthM = cols * cellM;
  const heightM = rows * cellM;
  const ppm = Math.max(2, Math.min(8, Math.round(4 / cellM)));
  const widthPx = Math.max(1, Math.ceil(widthM * ppm));
  const heightPx = Math.max(1, Math.ceil(heightM * ppm));
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(widthPx, heightPx);
  const scaleX = widthPx / widthM;
  const scaleY = heightPx / heightM;
  let cellCount = 0;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    if (sample.kind !== "roof-cell") continue;
    const hour = hours[index]!;
    if (hour < 0) continue;
    const span = sample.spanM;
    const rgba = sunHoursGroundRgba(hour, scaleMaxHours, false);
    if (rgba[3] === 0) continue;
    const x0m = sample.east - span * 0.5 - originEast;
    const y0m = sample.north - span * 0.5 - originNorth;
    const x1m = x0m + span;
    const y1m = y0m + span;
    const x0 = Math.floor(x0m * scaleX);
    const y0 = Math.floor((heightM - y1m) * scaleY);
    const x1 = Math.ceil(x1m * scaleX);
    const y1 = Math.ceil((heightM - y0m) * scaleY);
    cellCount += 1;
    const alpha = Math.round(rgba[3]! * 0.94);
    for (let y = Math.max(0, y0); y < Math.min(heightPx, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(widthPx, x1); x++) {
        const px = (y * widthPx + x) * 4;
        image.data[px] = rgba[0]!;
        image.data[px + 1] = rgba[1]!;
        image.data[px + 2] = rgba[2]!;
        image.data[px + 3] = alpha;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return {
    href: canvas.toDataURL("image/png"),
    east: originEast,
    north: originNorth,
    widthM,
    heightM,
    cellCount,
  };
}
