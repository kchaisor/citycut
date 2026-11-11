import { planShadowOffset } from "./buildingShadows";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "./solar";
import { pointInLocalMulti } from "./massingParcelBoundary";
import { buildDaylightGroundStepShadows } from "./solarPlanShadowSteps";
import { pointInPolygon } from "./useCascade";
import { sunHoursGroundFromLitSteps, SUN_HOURS_GROUND_CELL_M, SUN_HOURS_GROUND_STEP_MINUTES } from "./sunHoursGround";
import type { PlanShadowTreeMode } from "./buildingShadows";
import type { CityModel, Pt } from "../types";

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
};

function siteBounds(model: CityModel) {
  const half = model.sideM / 2;
  return { minE: -half, maxE: half, minN: -half, maxN: half };
}

function cellCenterInsideBuilding(model: CityModel, east: number, north: number): boolean {
  const point: Pt = [east, north];
  for (const building of model.buildings) {
    if (pointInPolygon(point, building.ring, building.holes ?? [])) return true;
  }
  return false;
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
  treeMode: PlanShadowTreeMode,
): { litSteps: Uint16Array; masked: Uint8Array; steps: number } | null {
  if (typeof document === "undefined") return null;
  const window = daylightWindowMinutes(model.center.lat, model.center.lon, year, month, day);
  if (!window) return null;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const fillRing = (points: Pt[]) => {
    if (points.length < 3) return;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = ((point[0] - originEast) / cellM - 0.5) + 0.5;
      const y = rows - 1 - ((point[1] - originNorth) / cellM - 0.5 + 0.5);
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
      if (cellCenterInsideBuilding(model, east, north)) masked[row * cols + col] = 1;
    }
  }
  const litSteps = new Uint16Array(cols * rows);
  let steps = 0;
  for (let minuteOfDay = window.sunrise; minuteOfDay <= window.sunset; minuteOfDay += stepMinutes) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const sample = sunAtMelbourneLocal(model.center.lat, model.center.lon, year, month, day, hour, minute);
    steps++;
    if (!sample.aboveHorizon) continue;
    ctx.clearRect(0, 0, cols, rows);
    ctx.fillStyle = "black";
    for (const building of model.buildings) {
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
    for (let index = 0; index < litSteps.length; index++) {
      if (masked[index]) continue;
      if (data[index * 4 + 3]! < 128) litSteps[index]! += 1;
    }
  }
  void treeMode;
  return { litSteps, masked, steps };
}

function computeSunHoursGroundGridMulti(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  cellM: number,
  treeMode: PlanShadowTreeMode,
  stepMinutes: number,
  cols: number,
  rows: number,
  originEast: number,
  originNorth: number,
): SunHoursGroundGrid | null {
  const stepShadows = buildDaylightGroundStepShadows(model, year, month, day, stepMinutes, treeMode);
  if (stepShadows.length === 0) return null;
  const litSteps = new Uint16Array(cols * rows);
  const masked = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const east = originEast + (col + 0.5) * cellM;
      const north = originNorth + (row + 0.5) * cellM;
      if (cellCenterInsideBuilding(model, east, north)) masked[row * cols + col] = 1;
    }
  }
  for (const stepShadow of stepShadows) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (masked[index]) continue;
        const east = originEast + (col + 0.5) * cellM;
        const north = originNorth + (row + 0.5) * cellM;
        if (!pointInLocalMulti([east, north], stepShadow.buildingShadow)) litSteps[index]! += 1;
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
  };
}

export function computeSunHoursGroundGrid(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  cellM = SUN_HOURS_GROUND_CELL_M,
  treeMode: PlanShadowTreeMode = "off",
  stepMinutes = SUN_HOURS_GROUND_STEP_MINUTES,
): SunHoursGroundGrid | null {
  const bounds = siteBounds(model);
  const cols = Math.max(1, Math.ceil((bounds.maxE - bounds.minE) / cellM));
  const rows = Math.max(1, Math.ceil((bounds.maxN - bounds.minN) / cellM));
  const originEast = bounds.minE;
  const originNorth = bounds.minN;
  if (typeof document === "undefined") {
    return computeSunHoursGroundGridMulti(
      model,
      year,
      month,
      day,
      cellM,
      treeMode,
      stepMinutes,
      cols,
      rows,
      originEast,
      originNorth,
    );
  }
  const raster = canvasLitStepCount(model, year, month, day, cols, rows, originEast, originNorth, cellM, stepMinutes, treeMode);
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
