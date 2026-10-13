import { planShadowOffset } from "./buildingShadows";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "./solar";
import type { CityModel, Pt } from "../types";

export type SunHoursGrid = { res: number; hours: Float32Array; maxHours: number; steps: number; ms: number; skipped: number };

/**
 * Later phase (flagged off): hours of direct sun on the ground through one day. Samples the plan building shadows
 * every `stepMinutes` from sunrise to sunset and counts, per grid cell, the samples in sun.
 * Buildings only (trees and imported models are not rasterised yet).
 */
export function sunHoursGrid(
  model: CityModel,
  date: { year: number; month: number; day: number },
  res = 256,
  stepMinutes = 30,
): SunHoursGrid | null {
  const started = performance.now();
  const window = daylightWindowMinutes(model.center.lat, model.center.lon, date.year, date.month, date.day);
  if (!window || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const half = model.sideM / 2;
  const toPx = (p: Pt): [number, number] => [((p[0] + half) / model.sideM) * res, ((half - p[1]) / model.sideM) * res];
  const sunCount = new Uint16Array(res * res);
  let steps = 0;
  const skipped = 0;
  for (let m = window.sunrise; m <= window.sunset; m += stepMinutes) {
    const sample = sunAtMelbourneLocal(model.center.lat, model.center.lon, date.year, date.month, date.day, Math.floor(m / 60), m % 60);
    steps++;
    ctx.clearRect(0, 0, res, res);
    if (!sample.aboveHorizon) continue;
    ctx.fillStyle = "black"; // mask only, never shown
    // Raster union: fill each building's footprint, its sun-offset copy and every wall quad.
    // No polygon clipping, so no degenerate-union failures.
    const fill = (points: Pt[]) => {
      if (points.length < 3) return;
      ctx.beginPath();
      points.forEach((p, i) => {
        const [x, y] = toPx(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
    };
    for (const building of model.buildings) {
      const offset = planShadowOffset(sample, building.height);
      if (!offset) continue;
      const ring = building.ring;
      fill(ring);
      fill(ring.map((p) => [p[0] + offset[0], p[1] + offset[1]] as Pt));
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        fill([a, b, [b[0] + offset[0], b[1] + offset[1]], [a[0] + offset[0], a[1] + offset[1]]]);
      }
    }
    const data = ctx.getImageData(0, 0, res, res).data;
    for (let i = 0; i < sunCount.length; i++) if (data[i * 4 + 3]! < 128) sunCount[i]!++;
  }
  // Roofs are not ground: leave footprints empty.
  ctx.clearRect(0, 0, res, res);
  ctx.fillStyle = "black"; // mask only, never shown
  for (const building of model.buildings) {
    ctx.beginPath();
    building.ring.forEach((p, i) => {
      const [x, y] = toPx(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  const roof = ctx.getImageData(0, 0, res, res).data;
  const stepH = stepMinutes / 60;
  const hours = new Float32Array(res * res);
  for (let i = 0; i < hours.length; i++) hours[i] = roof[i * 4 + 3]! >= 128 ? -1 : sunCount[i]! * stepH;
  return { res, hours, maxHours: steps * stepH, steps, skipped, ms: performance.now() - started };
}

/** Few hours → dark grey, full day → accent yellow. */
export function sunHoursColour(hours: number, maxHours: number): [number, number, number, number] {
  if (hours < 0) return [0, 0, 0, 0];
  const t = maxHours > 0 ? Math.min(1, Math.max(0, hours / maxHours)) : 0;
  const lo = [0x3a, 0x3c, 0x42];
  const hi = [0xff, 0xf5, 0x00];
  return [
    Math.round(lo[0]! + (hi[0]! - lo[0]!) * t),
    Math.round(lo[1]! + (hi[1]! - lo[1]!) * t),
    Math.round(lo[2]! + (hi[2]! - lo[2]!) * t),
    Math.round(255 * (0.78 - 0.18 * t)),
  ];
}
