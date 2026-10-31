import { planShadowOffset } from "./buildingShadows";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "./solar";
import type { CityModel, Pt } from "../types";

export type SunHoursGrid = { res: number; hours: Float32Array; maxHours: number; steps: number; ms: number; skipped: number };

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
    ctx.fillStyle = "black";
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
  ctx.clearRect(0, 0, res, res);
  ctx.fillStyle = "black";
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

function gridIndex(grid: SunHoursGrid, east: number, north: number, sideM: number): number {
  const half = sideM / 2;
  const px = Math.floor(((east + half) / sideM) * grid.res);
  const py = Math.floor(((half - north) / sideM) * grid.res);
  if (px < 0 || py < 0 || px >= grid.res || py >= grid.res) return -1;
  return py * grid.res + px;
}

/** Ground sun hours at a plan point; null when the cell is a roof mask or off the cut. */
export function sunHoursAtEastNorth(
  grid: SunHoursGrid,
  east: number,
  north: number,
  sideM: number,
): number | null {
  const direct = gridIndex(grid, east, north, sideM);
  if (direct >= 0) {
    const value = grid.hours[direct]!;
    if (value >= 0) return value;
  }
  const half = sideM / 2;
  const px = Math.floor(((east + half) / sideM) * grid.res);
  const py = Math.floor(((half - north) / sideM) * grid.res);
  const search = Math.max(2, Math.ceil(grid.res / 64));
  for (let radius = 1; radius <= search; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= grid.res || y >= grid.res) continue;
        const value = grid.hours[y * grid.res + x]!;
        if (value >= 0) return value;
      }
    }
  }
  return null;
}

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
