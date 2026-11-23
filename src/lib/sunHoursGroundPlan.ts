import { planShadowOffset, planShadowRings } from "./buildingShadows";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "./solar";
import { castsSunHoursShadow } from "./sunHoursBuildings";
import { pointInPolygon } from "./useCascade";
import {
  buildExtrudedFootprintMask,
  planPointUnderExtrudedFootprintMask,
  type ExtrudedFootprintMaskPart,
} from "./extrudedBuildingFootprint";
import { sunHoursGroundFromLitSteps, SUN_HOURS_GROUND_CELL_M, SUN_HOURS_GROUND_STEP_MINUTES } from "./sunHoursGround";
import { reportSunHoursStep, type SunHoursProgressCallback } from "./sunHoursProgress";
import type { CityModel, Pt, Ring } from "../types";

export type SunHoursGroundGrid = {
  cellM: number;
  originEast: number;
  originNorth: number;
  cols: number;
  rows: number;
  sunHours: Float32Array;
  maxSunHours: number;
  masked: Uint8Array;
  steps: number;
  stepMinutes: number;
};

function siteBounds(model: CityModel) {
  const half = model.sideM / 2;
  return { minE: -half, maxE: half, minN: -half, maxN: half };
}

export function planPointInsideAnyBuilding(
  model: CityModel,
  east: number,
  north: number,
  footprintMask?: readonly ExtrudedFootprintMaskPart[],
): boolean {
  const mask = footprintMask ?? buildExtrudedFootprintMask(model.buildings);
  return planPointUnderExtrudedFootprintMask(mask, east, north);
}

function cellCenterInsideExtrudedFootprint(
  mask: readonly ExtrudedFootprintMaskPart[],
  east: number,
  north: number,
): boolean {
  return planPointUnderExtrudedFootprintMask(mask, east, north);
}

export function sampleSunHoursGroundCell(
  grid: SunHoursGroundGrid,
  east: number,
  north: number,
): { hours: number; masked: boolean } {
  const col = Math.floor((east - grid.originEast) / grid.cellM);
  const row = Math.floor((north - grid.originNorth) / grid.cellM);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return { hours: -1, masked: true };
  const index = row * grid.cols + col;
  return { hours: grid.sunHours[index]!, masked: Boolean(grid.masked[index]) };
}

type RasterContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function rasterContext(cols: number, rows: number): RasterContext | null {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    return canvas.getContext("2d", { willReadFrequently: true });
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(cols, rows).getContext("2d", { willReadFrequently: true });
  }
  return null;
}

function canvasLitStepCount(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  cols: number,
  rows: number,
  originEast: number,
  originNorth: number,
  cellM: number,
  stepMinutes: number,
  footprintMask: readonly ExtrudedFootprintMaskPart[],
  ctx: RasterContext,
  onProgress?: SunHoursProgressCallback,
): { litSteps: Uint16Array; masked: Uint8Array; steps: number } | null {
  const window = daylightWindowMinutes(model.center.lat, model.center.lon, year, month, day);
  if (!window) return null;
  const fillRing = (points: Pt[]) => {
    if (points.length < 3) return;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = (point[0] - originEast) / cellM;
      const y = rows - (point[1] - originNorth) / cellM;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  };
  const masked = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const east = originEast + (col + 0.5) * cellM;
      const north = originNorth + (row + 0.5) * cellM;
      if (cellCenterInsideExtrudedFootprint(footprintMask, east, north)) masked[row * cols + col] = 1;
    }
  }
  const litSteps = new Uint16Array(cols * rows);
  let steps = 0;
  const totalSteps = Math.floor((window.sunset - window.sunrise) / stepMinutes) + 1;
  for (let minuteOfDay = window.sunrise; minuteOfDay <= window.sunset; minuteOfDay += stepMinutes) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const sample = sunAtMelbourneLocal(model.center.lat, model.center.lon, year, month, day, hour, minute);
    steps++;
    reportSunHoursStep(onProgress, steps, totalSteps);
    if (!sample.aboveHorizon) continue;
    ctx.clearRect(0, 0, cols, rows);
    ctx.fillStyle = "black";
    for (const building of model.buildings) {
      if (!castsSunHoursShadow(building)) continue;
      const offset = planShadowOffset(sample, building.height);
      if (!offset) continue;
      const ring = building.ring;
      fillRing(ring);
      fillRing(ring.map((point) => [point[0] + offset[0], point[1] + offset[1]] as Pt));
      for (let edge = 0; edge < ring.length; edge++) {
        const a = ring[edge]!;
        const b = ring[(edge + 1) % ring.length]!;
        fillRing([a, b, [b[0] + offset[0], b[1] + offset[1]], [a[0] + offset[0], a[1] + offset[1]]]);
      }
    }
    const data = ctx.getImageData(0, 0, cols, rows).data;
    for (let row = 0; row < rows; row++) {
      const canvasRow = rows - 1 - row;
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (masked[index]) continue;
        if (data[(canvasRow * cols + col) * 4 + 3]! < 128) litSteps[index]! += 1;
      }
    }
  }
  return { litSteps, masked, steps };
}

function daylightGroundStepShadows(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  stepMinutes: number,
  onProgress?: SunHoursProgressCallback,
): Ring[][][] {
  const { lat, lon } = model.center;
  const window = daylightWindowMinutes(lat, lon, year, month, day);
  if (!window) return [];
  const out: Ring[][][] = [];
  const totalSteps = Math.floor((window.sunset - window.sunrise) / stepMinutes) + 1;
  let steps = 0;
  for (let minuteOfDay = window.sunrise; minuteOfDay <= window.sunset; minuteOfDay += stepMinutes) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    steps++;
    reportSunHoursStep(onProgress, steps, totalSteps, 0, 0.55);
    if (!sunAtMelbourneLocal(lat, lon, year, month, day, hour, minute).aboveHorizon) continue;
    out.push(planShadowRings(model, { lat, lon, year, month, day, hour, minute }, true));
  }
  return out;
}

function pointInShadow(point: Pt, shadow: readonly Ring[][]): boolean {
  for (const [outer, ...holes] of shadow) {
    if (outer && outer.length >= 3 && pointInPolygon(point, outer, holes)) return true;
  }
  return false;
}

function computeSunHoursGroundGridMulti(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  cellM: number,
  stepMinutes: number,
  cols: number,
  rows: number,
  originEast: number,
  originNorth: number,
  footprintMask: readonly ExtrudedFootprintMaskPart[],
  onProgress?: SunHoursProgressCallback,
): SunHoursGroundGrid | null {
  const stepShadows = daylightGroundStepShadows(model, year, month, day, stepMinutes, onProgress);
  if (stepShadows.length === 0) return null;
  const litSteps = new Uint16Array(cols * rows);
  const masked = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const east = originEast + (col + 0.5) * cellM;
      const north = originNorth + (row + 0.5) * cellM;
      if (cellCenterInsideExtrudedFootprint(footprintMask, east, north)) masked[row * cols + col] = 1;
    }
  }
  const shadowTotal = stepShadows.length;
  let shadowDone = 0;
  for (const stepShadow of stepShadows) {
    shadowDone++;
    reportSunHoursStep(onProgress, shadowDone, shadowTotal, 0.55, 1);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (masked[index]) continue;
        const east = originEast + (col + 0.5) * cellM;
        const north = originNorth + (row + 0.5) * cellM;
        if (!pointInShadow([east, north], stepShadow)) litSteps[index]! += 1;
      }
    }
  }
  const sunHours = new Float32Array(cols * rows);
  let maxSunHours = 0;
  for (let index = 0; index < sunHours.length; index++) {
    if (masked[index]) {
      sunHours[index] = -1;
      continue;
    }
    const hours = sunHoursGroundFromLitSteps(litSteps[index]!, stepMinutes);
    sunHours[index] = hours;
    maxSunHours = Math.max(maxSunHours, hours);
  }
  return {
    cellM,
    originEast,
    originNorth,
    cols,
    rows,
    sunHours,
    maxSunHours,
    masked,
    steps: stepShadows.length,
    stepMinutes,
  };
}

export function computeSunHoursGroundGrid(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  cellM = SUN_HOURS_GROUND_CELL_M,
  stepMinutes = SUN_HOURS_GROUND_STEP_MINUTES,
  onProgress?: SunHoursProgressCallback,
): SunHoursGroundGrid | null {
  const bounds = siteBounds(model);
  const cols = Math.max(1, Math.ceil((bounds.maxE - bounds.minE) / cellM));
  const rows = Math.max(1, Math.ceil((bounds.maxN - bounds.minN) / cellM));
  const originEast = bounds.minE;
  const originNorth = bounds.minN;
  const footprintMask = buildExtrudedFootprintMask(model.buildings);
  const ctx = rasterContext(cols, rows);
  if (!ctx) {
    return computeSunHoursGroundGridMulti(
      model,
      year,
      month,
      day,
      cellM,
      stepMinutes,
      cols,
      rows,
      originEast,
      originNorth,
      footprintMask,
      onProgress,
    );
  }
  const raster = canvasLitStepCount(
    model,
    year,
    month,
    day,
    cols,
    rows,
    originEast,
    originNorth,
    cellM,
    stepMinutes,
    footprintMask,
    ctx,
    onProgress,
  );
  if (!raster || raster.steps === 0) return null;
  const { litSteps, masked, steps } = raster;
  const sunHours = new Float32Array(cols * rows);
  let maxSunHours = 0;
  for (let index = 0; index < sunHours.length; index++) {
    if (masked[index]) {
      sunHours[index] = -1;
      continue;
    }
    const hours = sunHoursGroundFromLitSteps(litSteps[index]!, stepMinutes);
    sunHours[index] = hours;
    maxSunHours = Math.max(maxSunHours, hours);
  }
  return {
    cellM,
    originEast,
    originNorth,
    cols,
    rows,
    sunHours,
    maxSunHours,
    masked,
    steps,
    stepMinutes,
  };
}

export function countSunHoursGroundCells(grid: SunHoursGroundGrid, minHours = 0.01): number {
  let count = 0;
  for (let index = 0; index < grid.sunHours.length; index++) {
    if (grid.masked[index]) continue;
    if (grid.sunHours[index]! >= minHours) count += 1;
  }
  return count;
}

export function footprintMaskedCells(grid: SunHoursGroundGrid): number {
  let count = 0;
  for (let index = 0; index < grid.masked.length; index++) if (grid.masked[index]) count += 1;
  return count;
}
