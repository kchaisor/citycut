import type { CityModel } from "../types";
import {
  createGroundWindGridBuilder,
  groundWindFieldCache,
  groundWindSector,
  rasterGroundWindObstacles,
  type GroundWindFlowGrid,
  type GroundWindGridBuilder,
  type GroundWindObstacles,
} from "./groundWindField";
import { GROUND_WIND_RAMP } from "./groundWindRamp";
import {
  accumulateSectorExceedance,
  emptyComfortFields,
  maskComponents,
  sectorReferenceSpeedMs,
  unsafeMask,
  type ComfortFields,
  type MaskComponent,
  type WindSeasonWeights,
} from "./windComfort";

export const WIND_PLAN_SPEED_MAX_MS = 6;
export const WIND_PLAN_SPEED_TICKS_MS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WIND_PLAN_CONTOUR_LEVELS_MS = [1, 2, 3, 4, 5] as const;
export const WIND_PLAN_BLUR_PASSES = 2;
export const WIND_PLAN_ROWS_PER_SLICE = 32;

export type WindPlanMode = "speed" | "comfort";

export type WindPlanGeometry = Pick<GroundWindObstacles, "cols" | "rows" | "cellM" | "originE" | "originN" | "solid">;

export type WindPlanSpeed = {
  key: string;
  sector: number;
  referenceMs: number;
  geometry: WindPlanGeometry;
  speedMs: Float32Array;
};

export type WindPlanComfort = {
  key: string;
  geometry: WindPlanGeometry;
  fields: ComfortFields;
  unsafeAreas: MaskComponent[];
};

export type WindPlanJob<T> = {
  step: (budgetMs: number) => boolean;
  result: () => T | null;
};

type PlanCache = { speed: Map<string, WindPlanSpeed>; comfort: Map<string, WindPlanComfort> };

const planCaches = new WeakMap<CityModel, PlanCache>();
const ratioCache = new WeakMap<GroundWindFlowGrid, Float32Array>();

function planCache(model: CityModel): PlanCache {
  let cache = planCaches.get(model);
  if (!cache) {
    cache = { speed: new Map(), comfort: new Map() };
    planCaches.set(model, cache);
  }
  return cache;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function fillSolidCells(values: Float32Array, solid: Uint8Array, cols: number, rows: number, fallback: number): Float32Array {
  const out = Float32Array.from(values);
  const known = new Uint8Array(values.length);
  let pending: number[] = [];
  for (let idx = 0; idx < values.length; idx++) {
    if (solid[idx]) pending.push(idx);
    else known[idx] = 1;
  }
  while (pending.length > 0) {
    const filled: Array<[number, number]> = [];
    const still: number[] = [];
    for (const idx of pending) {
      const i = idx % cols;
      const j = (idx - i) / cols;
      let sum = 0;
      let count = 0;
      const take = (n: number) => {
        if (!known[n]) return;
        sum += out[n]!;
        count += 1;
      };
      if (i > 0) take(idx - 1);
      if (i + 1 < cols) take(idx + 1);
      if (j > 0) take(idx - cols);
      if (j + 1 < rows) take(idx + cols);
      if (count > 0) filled.push([idx, sum / count]);
      else still.push(idx);
    }
    if (filled.length === 0) {
      for (const idx of still) out[idx] = fallback;
      break;
    }
    for (const [idx, value] of filled) {
      out[idx] = value;
      known[idx] = 1;
    }
    pending = still;
  }
  return out;
}

export function boxBlur3(values: Float32Array, cols: number, rows: number): Float32Array {
  const tmp = new Float32Array(values.length);
  const out = new Float32Array(values.length);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const row = j * cols;
      tmp[row + i] = (values[row + Math.max(0, i - 1)]! + values[row + i]! + values[row + Math.min(cols - 1, i + 1)]!) / 3;
    }
  }
  for (let j = 0; j < rows; j++) {
    const up = Math.max(0, j - 1) * cols;
    const down = Math.min(rows - 1, j + 1) * cols;
    for (let i = 0; i < cols; i++) out[j * cols + i] = (tmp[up + i]! + tmp[j * cols + i]! + tmp[down + i]!) / 3;
  }
  return out;
}

export function windPlanRatioField(grid: GroundWindFlowGrid): Float32Array {
  const cached = ratioCache.get(grid);
  if (cached) return cached;
  const { cols, rows, solid } = grid.obstacles;
  let ratio = fillSolidCells(grid.speed, solid, cols, rows, 1);
  for (let pass = 0; pass < WIND_PLAN_BLUR_PASSES; pass++) ratio = boxBlur3(ratio, cols, rows);
  ratioCache.set(grid, ratio);
  return ratio;
}

export function windPlanGeometry(obs: GroundWindObstacles): WindPlanGeometry {
  return { cols: obs.cols, rows: obs.rows, cellM: obs.cellM, originE: obs.originE, originN: obs.originN, solid: obs.solid };
}

export function windPlanSpeedField(ratio: ArrayLike<number>, referenceMs: number): Float32Array {
  const out = new Float32Array(ratio.length);
  for (let idx = 0; idx < out.length; idx++) out[idx] = ratio[idx]! * referenceMs;
  return out;
}

export function windPlanSpeedKey(seasonKey: string, sector: number): string {
  return `${seasonKey}:${groundWindSector(sector)}`;
}

export function cachedWindPlanSpeed(model: CityModel, key: string): WindPlanSpeed | null {
  return planCache(model).speed.get(key) ?? null;
}

export function cachedWindPlanComfort(model: CityModel, key: string): WindPlanComfort | null {
  return planCache(model).comfort.get(key) ?? null;
}

export function createWindPlanSpeedJob(
  model: CityModel,
  seasonKey: string,
  weights: WindSeasonWeights,
  sectorIn: number,
): WindPlanJob<WindPlanSpeed> | null {
  const sector = groundWindSector(sectorIn);
  const referenceMs = sectorReferenceSpeedMs(weights, sector);
  if (referenceMs == null) return null;
  const key = windPlanSpeedKey(seasonKey, sector);
  const cache = planCache(model);
  let result = cache.speed.get(key) ?? null;
  const builder = result ? null : createGroundWindGridBuilder(groundWindFieldCache(model), sector);
  return {
    step(budgetMs) {
      if (result) return true;
      if (!builder!.step(budgetMs)) return false;
      const grid = builder!.finish();
      result = {
        key,
        sector,
        referenceMs,
        geometry: windPlanGeometry(grid.obstacles),
        speedMs: windPlanSpeedField(windPlanRatioField(grid), referenceMs),
      };
      cache.speed.set(key, result);
      return true;
    },
    result: () => result,
  };
}

export function finishWindPlanComfort(geometry: WindPlanGeometry, fields: ComfortFields, key: string): WindPlanComfort {
  const { solid, cols, rows } = geometry;
  for (let idx = 0; idx < solid.length; idx++) if (solid[idx]) fields.p15[idx] = 0;
  return { key, geometry, fields, unsafeAreas: maskComponents(unsafeMask(fields, solid), cols, rows) };
}

export function createWindPlanComfortJob(model: CityModel, seasonKey: string, weights: WindSeasonWeights): WindPlanJob<WindPlanComfort> {
  const cache = planCache(model);
  let result = cache.comfort.get(seasonKey) ?? null;
  const sectors = [...new Set(weights.bins.map((bin) => bin.sector))];
  const fieldCache = groundWindFieldCache(model);
  let sectorAt = 0;
  let builder: GroundWindGridBuilder | null = null;
  let ratio: Float32Array | null = null;
  let row = 0;
  let geometry: WindPlanGeometry | null = null;
  let fields: ComfortFields | null = null;

  const work = (budgetMs: number): boolean => {
    if (sectorAt >= sectors.length) {
      if (!geometry) {
        const obs = buildObstaclesOnly();
        geometry = windPlanGeometry(obs);
        fields = emptyComfortFields(obs.cols, obs.rows);
      }
      result = finishWindPlanComfort(geometry, fields!, seasonKey);
      cache.comfort.set(seasonKey, result);
      return true;
    }
    const sector = sectors[sectorAt]!;
    if (!ratio) {
      builder ??= createGroundWindGridBuilder(fieldCache, sector);
      if (!builder.step(budgetMs)) return false;
      const grid = builder.finish();
      builder = null;
      ratio = windPlanRatioField(grid);
      if (!geometry) {
        geometry = windPlanGeometry(grid.obstacles);
        fields = emptyComfortFields(grid.obstacles.cols, grid.obstacles.rows);
      }
      row = 0;
      return false;
    }
    const { cols, rows } = geometry!;
    const next = Math.min(rows, row + WIND_PLAN_ROWS_PER_SLICE);
    accumulateSectorExceedance(fields!, weights, sector, ratio, row * cols, next * cols);
    row = next;
    if (row >= rows) {
      ratio = null;
      sectorAt += 1;
    }
    return false;
  };

  const buildObstaclesOnly = (): GroundWindObstacles => {
    fieldCache.obstacles ??= rasterGroundWindObstacles(model);
    return fieldCache.obstacles;
  };

  return {
    step(budgetMs) {
      const start = now();
      while (!result) {
        if (work(Math.max(0, budgetMs - (now() - start)))) break;
        if (now() - start >= budgetMs) break;
      }
      return result !== null;
    },
    result: () => result,
  };
}

export type RampStop = { ms: number; rgb: [number, number, number] };

export function windPlanRampStops(colourRgb: (token: (typeof GROUND_WIND_RAMP)[number]["token"]) => { r: number; g: number; b: number }): RampStop[] {
  return GROUND_WIND_RAMP.map((stop) => {
    const { r, g, b } = colourRgb(stop.token);
    return { ms: stop.legendAt * WIND_PLAN_SPEED_MAX_MS, rgb: [r, g, b] };
  });
}

export function rampRgb(stops: readonly RampStop[], ms: number, out: [number, number, number]): [number, number, number] {
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (ms <= first.ms) return copyRgb(first.rgb, out);
  if (ms >= last.ms) return copyRgb(last.rgb, out);
  for (let k = 1; k < stops.length; k++) {
    const b = stops[k]!;
    if (ms > b.ms) continue;
    const a = stops[k - 1]!;
    const t = (ms - a.ms) / Math.max(1e-9, b.ms - a.ms);
    out[0] = a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t;
    out[1] = a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t;
    out[2] = a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t;
    return out;
  }
  return copyRgb(last.rgb, out);
}

function copyRgb(rgb: readonly [number, number, number], out: [number, number, number]): [number, number, number] {
  out[0] = rgb[0];
  out[1] = rgb[1];
  out[2] = rgb[2];
  return out;
}
