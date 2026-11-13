import type { CityModel, Pt, Ring } from "../types";
import { downwindFromSector } from "./windRose";
import { sampleTerrain } from "./terrain";
import { pointInPolygon } from "./useCascade";
import { groundWindOnAsphalt } from "./groundWindSurface";

export const GROUND_WIND_DEFAULT_SECTOR = 0;
export const GROUND_WIND_CELL_MIN_M = 2;
export const GROUND_WIND_CELL_MAX_M = 4;
export const GROUND_WIND_CELLS_TARGET = 320;
export const GROUND_WIND_COARSE_FACTOR = 4;
export const GROUND_WIND_COARSE_SWEEPS = 160;
export const GROUND_WIND_FINE_SWEEPS = 70;
export const GROUND_WIND_SOR_OMEGA = 1.82;
export const GROUND_WIND_SHELTER_FLOOR = 0.14;
export const GROUND_WIND_WAKE_HEIGHT_MULTIPLE = 3;
export const GROUND_WIND_WAKE_MIN_M = 12;
export const GROUND_WIND_WAKE_MAX_M = 90;
export const GROUND_WIND_SPEED_MIN = 0.08;

export type WindVector = { east: number; north: number };

export type GroundWindField = {
  cols: number;
  rows: number;
  cellM: number;
  originE: number;
  originN: number;
  solid: Uint8Array;
  road: Uint8Array;
  fluidCells: Int32Array;
  faceU: Float32Array;
  faceV: Float32Array;
  shelter: Float32Array;
  base: WindVector;
};

export type GroundWindFieldBuilder = {
  step: (budgetMs: number) => boolean;
  finish: () => GroundWindField;
  readonly done: boolean;
};

export function groundWindBaseVector(sector: number | undefined): WindVector {
  return downwindFromSector(sector ?? GROUND_WIND_DEFAULT_SECTOR);
}

export function groundWindCellM(sideM: number): number {
  return Math.min(GROUND_WIND_CELL_MAX_M, Math.max(GROUND_WIND_CELL_MIN_M, sideM / GROUND_WIND_CELLS_TARGET));
}

type Extent = { minE: number; maxE: number; minN: number; maxN: number };

function cutExtent(model: CityModel): Extent {
  const w = model.widthM ?? model.sideM;
  const h = model.heightM ?? model.sideM;
  return { minE: -w / 2, maxE: w / 2, minN: -h / 2, maxN: h / 2 };
}

function rasterRing(
  ring: Ring,
  cols: number,
  rows: number,
  cellM: number,
  originE: number,
  originN: number,
  heightM: number,
  heights: Float32Array,
) {
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [, n] of ring) {
    minN = Math.min(minN, n);
    maxN = Math.max(maxN, n);
  }
  const j0 = Math.max(0, Math.floor((minN - originN) / cellM));
  const j1 = Math.min(rows - 1, Math.floor((maxN - originN) / cellM));
  const crossings: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const y = originN + (j + 0.5) * cellM;
    crossings.length = 0;
    for (let k = 0, m = ring.length; k < m; k++) {
      const [ax, ay] = ring[k]!;
      const [bx, by] = ring[(k + 1) % m]!;
      if (ay === by) continue;
      if (y < Math.min(ay, by) || y >= Math.max(ay, by)) continue;
      crossings.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    for (let c = 0; c + 1 < crossings.length; c += 2) {
      const i0 = Math.max(0, Math.ceil((crossings[c]! - originE) / cellM - 0.5));
      const i1 = Math.min(cols - 1, Math.floor((crossings[c + 1]! - originE) / cellM - 0.5));
      for (let i = i0; i <= i1; i++) {
        const idx = j * cols + i;
        if (heights[idx]! < heightM) heights[idx] = heightM;
      }
    }
  }
}

export type GroundWindRaster = {
  cols: number;
  rows: number;
  cellM: number;
  originE: number;
  originN: number;
  solid: Uint8Array;
  heights: Float32Array;
};

function rasterRoadMask(model: CityModel, cols: number, rows: number, cellM: number, originE: number, originN: number): Uint8Array {
  const road = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const east = originE + (i + 0.5) * cellM;
      const north = originN + (j + 0.5) * cellM;
      if (groundWindOnAsphalt(model, east, north)) road[j * cols + i] = 1;
    }
  }
  return road;
}

export function rasterSolids(model: CityModel): GroundWindRaster {
  const ext = cutExtent(model);
  const cellM = groundWindCellM(Math.max(ext.maxE - ext.minE, ext.maxN - ext.minN));
  const cols = Math.max(4, Math.ceil((ext.maxE - ext.minE) / cellM));
  const rows = Math.max(4, Math.ceil((ext.maxN - ext.minN) / cellM));
  const heights = new Float32Array(cols * rows);
  for (const building of model.buildings) {
    rasterRing(building.ring, cols, rows, cellM, ext.minE, ext.minN, Math.max(3, building.height), heights);
  }
  const solid = new Uint8Array(cols * rows);
  for (let idx = 0; idx < heights.length; idx++) solid[idx] = heights[idx]! > 0 ? 1 : 0;
  return { cols, rows, cellM, originE: ext.minE, originN: ext.minN, solid, heights };
}

type PressureGrid = {
  cols: number;
  rows: number;
  solid: Uint8Array;
  rhs: Float32Array;
  p: Float32Array;
  fluidCount: Uint8Array;
};

function pressureGrid(cols: number, rows: number, solid: Uint8Array, cellM: number, base: WindVector): PressureGrid {
  const rhs = new Float32Array(cols * rows);
  const fluidCount = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      if (solid[idx]) continue;
      let count = 0;
      let flux = 0;
      const eastOpen = i + 1 >= cols || !solid[idx + 1];
      const westOpen = i - 1 < 0 || !solid[idx - 1];
      const northOpen = j + 1 >= rows || !solid[idx + cols];
      const southOpen = j - 1 < 0 || !solid[idx - cols];
      if (eastOpen) {
        count++;
        flux += base.east;
      }
      if (westOpen) {
        count++;
        flux -= base.east;
      }
      if (northOpen) {
        count++;
        flux += base.north;
      }
      if (southOpen) {
        count++;
        flux -= base.north;
      }
      fluidCount[idx] = count;
      rhs[idx] = -cellM * flux;
    }
  }
  return { cols, rows, solid, rhs, p: new Float32Array(cols * rows), fluidCount };
}

function sorSweep(grid: PressureGrid, parity: 0 | 1, omega: number) {
  const { cols, rows, solid, rhs, p, fluidCount } = grid;
  for (let j = 0; j < rows; j++) {
    const start = (j + parity) & 1;
    for (let i = start; i < cols; i += 2) {
      const idx = j * cols + i;
      if (solid[idx]) continue;
      const count = fluidCount[idx]!;
      if (count === 0) continue;
      let sum = 0;
      if (i + 1 < cols && !solid[idx + 1]) sum += p[idx + 1]!;
      if (i - 1 >= 0 && !solid[idx - 1]) sum += p[idx - 1]!;
      if (j + 1 < rows && !solid[idx + cols]) sum += p[idx + cols]!;
      if (j - 1 >= 0 && !solid[idx - cols]) sum += p[idx - cols]!;
      const next = (sum + rhs[idx]!) / count;
      p[idx] = p[idx]! + omega * (next - p[idx]!);
    }
  }
}

function coarsenSolid(solid: Uint8Array, cols: number, rows: number, factor: number): { solid: Uint8Array; cols: number; rows: number } {
  const ccols = Math.max(2, Math.ceil(cols / factor));
  const crows = Math.max(2, Math.ceil(rows / factor));
  const out = new Uint8Array(ccols * crows);
  for (let cj = 0; cj < crows; cj++) {
    for (let ci = 0; ci < ccols; ci++) {
      let filled = 0;
      let total = 0;
      for (let j = cj * factor; j < Math.min(rows, (cj + 1) * factor); j++) {
        for (let i = ci * factor; i < Math.min(cols, (ci + 1) * factor); i++) {
          total++;
          filled += solid[j * cols + i]!;
        }
      }
      out[cj * ccols + ci] = filled * 2 > total ? 1 : 0;
    }
  }
  return { solid: out, cols: ccols, rows: crows };
}

function prolongate(coarse: PressureGrid, fine: PressureGrid, factor: number) {
  for (let j = 0; j < fine.rows; j++) {
    const y = Math.min(coarse.rows - 1, Math.max(0, (j + 0.5) / factor - 0.5));
    const j0 = Math.floor(y);
    const j1 = Math.min(coarse.rows - 1, j0 + 1);
    const ty = y - j0;
    for (let i = 0; i < fine.cols; i++) {
      const x = Math.min(coarse.cols - 1, Math.max(0, (i + 0.5) / factor - 0.5));
      const i0 = Math.floor(x);
      const i1 = Math.min(coarse.cols - 1, i0 + 1);
      const tx = x - i0;
      const a = coarse.p[j0 * coarse.cols + i0]!;
      const b = coarse.p[j0 * coarse.cols + i1]!;
      const c = coarse.p[j1 * coarse.cols + i0]!;
      const d = coarse.p[j1 * coarse.cols + i1]!;
      fine.p[j * fine.cols + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
}

function faceVelocities(grid: PressureGrid, cellM: number, base: WindVector): { faceU: Float32Array; faceV: Float32Array } {
  const { cols, rows, solid, p } = grid;
  const faceU = new Float32Array((cols + 1) * rows);
  const faceV = new Float32Array(cols * (rows + 1));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const left = i - 1 >= 0 ? (solid[j * cols + i - 1] ? null : p[j * cols + i - 1]!) : 0;
      const right = i < cols ? (solid[j * cols + i] ? null : p[j * cols + i]!) : 0;
      faceU[j * (cols + 1) + i] = left === null || right === null ? 0 : base.east - (right - left) / cellM;
    }
  }
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < cols; i++) {
      const below = j - 1 >= 0 ? (solid[(j - 1) * cols + i] ? null : p[(j - 1) * cols + i]!) : 0;
      const above = j < rows ? (solid[j * cols + i] ? null : p[j * cols + i]!) : 0;
      faceV[j * cols + i] = below === null || above === null ? 0 : base.north - (above - below) / cellM;
    }
  }
  return { faceU, faceV };
}

function shelterField(
  solid: Uint8Array,
  heights: Float32Array,
  cols: number,
  rows: number,
  cellM: number,
  base: WindVector,
): Float32Array {
  const shelter = new Float32Array(cols * rows).fill(1);
  const stepE = base.east;
  const stepN = base.north;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      if (!solid[idx]) continue;
      const li = i + Math.round(stepE);
      const lj = j + Math.round(stepN);
      if (li < 0 || lj < 0 || li >= cols || lj >= rows) continue;
      if (solid[lj * cols + li]) continue;
      const wakeM = Math.min(
        GROUND_WIND_WAKE_MAX_M,
        Math.max(GROUND_WIND_WAKE_MIN_M, heights[idx]! * GROUND_WIND_WAKE_HEIGHT_MULTIPLE),
      );
      const steps = Math.ceil(wakeM / cellM);
      for (let s = 1; s <= steps; s++) {
        const x = Math.round(i + stepE * s);
        const y = Math.round(j + stepN * s);
        if (x < 0 || y < 0 || x >= cols || y >= rows) break;
        const wIdx = y * cols + x;
        if (solid[wIdx]) break;
        const t = s / steps;
        const factor = GROUND_WIND_SHELTER_FLOOR + (1 - GROUND_WIND_SHELTER_FLOOR) * t * t;
        if (factor < shelter[wIdx]!) shelter[wIdx] = factor;
      }
    }
  }
  return blurFluid(shelter, solid, cols, rows);
}

function blurFluid(values: Float32Array, solid: Uint8Array, cols: number, rows: number): Float32Array {
  const out = new Float32Array(values.length);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      if (solid[idx]) {
        out[idx] = 0;
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = i + di;
          const y = j + dj;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const n = y * cols + x;
          if (solid[n]) continue;
          sum += values[n]!;
          count++;
        }
      }
      out[idx] = count ? sum / count : 0;
    }
  }
  return out;
}

export function createGroundWindFieldBuilder(model: CityModel, base: WindVector): GroundWindFieldBuilder {
  const { cols, rows, cellM, originE, originN, solid, heights } = rasterSolids(model);
  const coarse = coarsenSolid(solid, cols, rows, GROUND_WIND_COARSE_FACTOR);
  const coarseGrid = pressureGrid(coarse.cols, coarse.rows, coarse.solid, cellM * GROUND_WIND_COARSE_FACTOR, base);
  const fineGrid = pressureGrid(cols, rows, solid, cellM, base);
  let coarseSweeps = 0;
  let fineSweeps = 0;
  let prolonged = false;
  let result: GroundWindField | null = null;

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const work = (): boolean => {
    if (coarseSweeps < GROUND_WIND_COARSE_SWEEPS) {
      sorSweep(coarseGrid, 0, GROUND_WIND_SOR_OMEGA);
      sorSweep(coarseGrid, 1, GROUND_WIND_SOR_OMEGA);
      coarseSweeps++;
      return false;
    }
    if (!prolonged) {
      prolongate(coarseGrid, fineGrid, GROUND_WIND_COARSE_FACTOR);
      prolonged = true;
      return false;
    }
    if (fineSweeps < GROUND_WIND_FINE_SWEEPS) {
      sorSweep(fineGrid, 0, GROUND_WIND_SOR_OMEGA);
      sorSweep(fineGrid, 1, GROUND_WIND_SOR_OMEGA);
      fineSweeps++;
      return false;
    }
    const { faceU, faceV } = faceVelocities(fineGrid, cellM, base);
    const shelter = shelterField(solid, heights, cols, rows, cellM, base);
    const road = rasterRoadMask(model, cols, rows, cellM, originE, originN);
    const fluid: number[] = [];
    for (let idx = 0; idx < solid.length; idx++) if (!solid[idx]) fluid.push(idx);
    result = {
      cols,
      rows,
      cellM,
      originE,
      originN,
      solid,
      road,
      fluidCells: Int32Array.from(fluid),
      faceU,
      faceV,
      shelter,
      base,
    };
    return true;
  };

  return {
    get done() {
      return result !== null;
    },
    step(budgetMs: number) {
      const start = now();
      while (result === null) {
        if (work()) break;
        if (now() - start >= budgetMs) break;
      }
      return result !== null;
    },
    finish() {
      while (result === null) work();
      return result;
    },
  };
}

export function buildGroundWindField(model: CityModel, base: WindVector): GroundWindField {
  return createGroundWindFieldBuilder(model, base).finish();
}

export function groundWindCellIndex(field: GroundWindField, east: number, north: number): number {
  const i = Math.floor((east - field.originE) / field.cellM);
  const j = Math.floor((north - field.originN) / field.cellM);
  if (i < 0 || j < 0 || i >= field.cols || j >= field.rows) return -1;
  return j * field.cols + i;
}

export function groundWindIsSolid(field: GroundWindField, east: number, north: number): boolean {
  const idx = groundWindCellIndex(field, east, north);
  return idx >= 0 && field.solid[idx] === 1;
}

export function groundWindCasingAt(field: GroundWindField, east: number, north: number): boolean {
  const idx = groundWindCellIndex(field, east, north);
  return idx >= 0 && field.road[idx] === 1;
}

function bilinear(values: Float32Array, cols: number, rows: number, x: number, y: number): number {
  const cx = Math.min(cols - 1, Math.max(0, x));
  const cy = Math.min(rows - 1, Math.max(0, y));
  const i0 = Math.floor(cx);
  const j0 = Math.floor(cy);
  const i1 = Math.min(cols - 1, i0 + 1);
  const j1 = Math.min(rows - 1, j0 + 1);
  const tx = cx - i0;
  const ty = cy - j0;
  const a = values[j0 * cols + i0]!;
  const b = values[j0 * cols + i1]!;
  const c = values[j1 * cols + i0]!;
  const d = values[j1 * cols + i1]!;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export function groundWindVelocityAt(field: GroundWindField, east: number, north: number, out: WindVector): WindVector {
  const gx = (east - field.originE) / field.cellM;
  const gy = (north - field.originN) / field.cellM;
  const u = bilinear(field.faceU, field.cols + 1, field.rows, gx, gy - 0.5);
  const v = bilinear(field.faceV, field.cols, field.rows + 1, gx - 0.5, gy);
  const shelter = bilinear(field.shelter, field.cols, field.rows, gx - 0.5, gy - 0.5);
  const mag = Math.hypot(u, v);
  const stream = Math.hypot(field.base.east, field.base.north) || 1;
  const gapBoost =
    shelter > 0.88 && mag > stream * 1.02 ? 1 + Math.min(0.38, (mag / stream - 1.02) * 5) : 1;
  const scale = Math.max(GROUND_WIND_SPEED_MIN, shelter) * gapBoost;
  out.east = u * scale;
  out.north = v * scale;
  return out;
}

export function groundWindSpeedAt(field: GroundWindField, east: number, north: number): number {
  const v = groundWindVelocityAt(field, east, north, { east: 0, north: 0 });
  return Math.hypot(v.east, v.north);
}

export function groundWindHeightAt(model: CityModel, east: number, north: number): number {
  const y = model.terrain ? sampleTerrain(model.terrain, east, north, model.sideM) : 0;
  return y + Math.max(0.6, model.sideM * 0.0012);
}

export function groundWindInsideFootprint(model: CityModel, east: number, north: number): boolean {
  const at: Pt = [east, north];
  for (let i = 0; i < model.buildings.length; i++) {
    const building = model.buildings[i]!;
    if (pointInPolygon(at, building.ring, building.holes)) return true;
  }
  return false;
}
