import type { CityModel } from "../types";
import {
  createGroundWindGridBuilder,
  GROUND_WIND_LATERAL_REACH_M,
  GROUND_WIND_TREE_WAKE_HEIGHT_MULTIPLE,
  GROUND_WIND_WAKE_HEIGHT_MULTIPLE,
  GROUND_WIND_WAKE_MAX_M,
  GROUND_WIND_WAKE_MIN_M,
  groundWindFieldCache,
  groundWindObstaclesFromRasters,
  groundWindSector,
  rasterGroundWindObstacles,
  type GroundWindFieldCache,
  type GroundWindFlowGrid,
  type GroundWindGridBuilder,
  type GroundWindObstacles,
} from "./groundWindField";
import type { ColourKey } from "./colours";
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

export const WIND_PLAN_SPEED_MAX_MS = 4;
export const WIND_PLAN_SPEED_TICKS_MS = [0, 1, 2, 3, 4] as const;
export const WIND_PLAN_CONTOUR_STEP_MS = 0.25;
export const WIND_PLAN_CONTOUR_LEVELS_MS: readonly number[] = Array.from(
  { length: Math.round(WIND_PLAN_SPEED_MAX_MS / WIND_PLAN_CONTOUR_STEP_MS) - 1 },
  (_, k) => (k + 1) * WIND_PLAN_CONTOUR_STEP_MS,
);
export const WIND_PLAN_IMAGE_UPSCALE = 4;
export const WIND_PLAN_IMAGE_MAX_PIXELS = 4_000_000;

export const WIND_PLAN_SPEED_RAMP: ReadonlyArray<{ token: ColourKey; ms: number }> = [
  { token: "--wind-plan-speed-still", ms: 0 },
  { token: "--wind-plan-speed-calm", ms: 1 },
  { token: "--wind-plan-speed-breeze", ms: 2 },
  { token: "--wind-plan-speed-brisk", ms: 2.8 },
  { token: "--wind-plan-speed-strong", ms: 3.5 },
  { token: "--wind-plan-speed-fast", ms: WIND_PLAN_SPEED_MAX_MS },
];
export const WIND_PLAN_BLUR_PASSES = 2;
export const WIND_PLAN_DISPLAY_SIGMA_M = 6;
export const WIND_PLAN_ROWS_PER_SLICE = 32;

// Power-law wind profile u(z) = u(z_ref) * (z / z_ref)^alpha, taking the station's 10 m speed down to
// 1.5 m pedestrian height with alpha = 0.25 for suburban terrain, as tabulated in Counihan (1975),
// "Adiabatic atmospheric boundary layers", Atmospheric Environment 9(10), and standard wind-engineering texts.
export const STATION_HEIGHT_M = 10;
export const PEDESTRIAN_HEIGHT_M = 1.5;
export const SUBURBAN_PROFILE_ALPHA = 0.25;

export function powerLawHeightFactor(fromM: number, toM: number, alpha: number): number {
  return Math.pow(toM / fromM, alpha);
}

export const PEDESTRIAN_HEIGHT_FACTOR = powerLawHeightFactor(STATION_HEIGHT_M, PEDESTRIAN_HEIGHT_M, SUBURBAN_PROFILE_ALPHA);

export function windPlanReferenceMs(weights: WindSeasonWeights, sector: number): number | null {
  const stationMs = sectorReferenceSpeedMs(weights, sector);
  return stationMs == null ? null : stationMs * PEDESTRIAN_HEIGHT_FACTOR;
}

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

type PlanFlow = {
  inner: GroundWindObstacles;
  pad: number;
  padded: GroundWindFieldCache;
  ratios: Map<number, Float32Array>;
};

type PlanCache = { flow: PlanFlow | null; speed: Map<string, WindPlanSpeed>; comfort: Map<string, WindPlanComfort> };

const planCaches = new WeakMap<CityModel, PlanCache>();

function planCache(model: CityModel): PlanCache {
  let cache = planCaches.get(model);
  if (!cache) {
    cache = { flow: null, speed: new Map(), comfort: new Map() };
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

export function gaussianBlur(values: Float32Array, cols: number, rows: number, sigmaCells: number): Float32Array {
  if (!(sigmaCells > 0)) return Float32Array.from(values);
  const radius = Math.ceil(sigmaCells * 3);
  const kernel = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) {
    const weight = Math.exp(-(k * k) / (2 * sigmaCells * sigmaCells));
    kernel[k + radius] = weight;
    total += weight;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] = kernel[k]! / total;
  const tmp = new Float32Array(values.length);
  const out = new Float32Array(values.length);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += kernel[k + radius]! * values[j * cols + mirrorIndex(i + k, cols)]!;
      tmp[j * cols + i] = sum;
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += kernel[k + radius]! * tmp[mirrorIndex(j + k, rows) * cols + i]!;
      out[j * cols + i] = sum;
    }
  }
  return out;
}

export function mirrorIndex(k: number, n: number): number {
  let m = k;
  while (m < 0 || m >= n) m = m < 0 ? -1 - m : 2 * n - 1 - m;
  return m;
}

export function windPlanEdgePadCells(obs: GroundWindObstacles): number {
  let tallest = 0;
  let canopy = 0;
  for (let idx = 0; idx < obs.heights.length; idx++) {
    if (obs.heights[idx]! > tallest) tallest = obs.heights[idx]!;
    if (obs.canopy[idx]! > canopy) canopy = obs.canopy[idx]!;
  }
  const wakeM = Math.max(tallest * GROUND_WIND_WAKE_HEIGHT_MULTIPLE, canopy * GROUND_WIND_TREE_WAKE_HEIGHT_MULTIPLE);
  const reachM = Math.min(GROUND_WIND_WAKE_MAX_M, Math.max(GROUND_WIND_WAKE_MIN_M, wakeM)) + GROUND_WIND_LATERAL_REACH_M;
  return Math.min(obs.cols, obs.rows, Math.ceil(reachM / obs.cellM));
}

export function wrapIndex(k: number, n: number): number {
  return ((k % n) + n) % n;
}

export function periodicPadObstacles(obs: GroundWindObstacles, pad: number): GroundWindObstacles {
  const cols = obs.cols + pad * 2;
  const rows = obs.rows + pad * 2;
  const heights = new Float32Array(cols * rows);
  const canopy = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const row = wrapIndex(j - pad, obs.rows) * obs.cols;
    for (let i = 0; i < cols; i++) {
      const src = row + wrapIndex(i - pad, obs.cols);
      heights[j * cols + i] = obs.heights[src]!;
      canopy[j * cols + i] = obs.canopy[src]!;
    }
  }
  const grid = { cols, rows, cellM: obs.cellM, originE: obs.originE - pad * obs.cellM, originN: obs.originN - pad * obs.cellM };
  return groundWindObstaclesFromRasters(grid, heights, canopy);
}

export function cropPadded(values: Float32Array, paddedCols: number, pad: number, cols: number, rows: number): Float32Array {
  const out = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) out.set(values.subarray((j + pad) * paddedCols + pad, (j + pad) * paddedCols + pad + cols), j * cols);
  return out;
}

export function windPlanRatioField(grid: GroundWindFlowGrid, pad: number, cols: number, rows: number): Float32Array {
  const { cols: paddedCols, rows: paddedRows, solid } = grid.obstacles;
  let ratio = fillSolidCells(grid.speed, solid, paddedCols, paddedRows, 1);
  for (let pass = 0; pass < WIND_PLAN_BLUR_PASSES; pass++) ratio = boxBlur3(ratio, paddedCols, paddedRows);
  return cropPadded(ratio, paddedCols, pad, cols, rows);
}

function planFlow(model: CityModel): PlanFlow {
  const cache = planCache(model);
  if (!cache.flow) {
    const shared = groundWindFieldCache(model);
    shared.obstacles ??= rasterGroundWindObstacles(model);
    const inner = shared.obstacles;
    const pad = windPlanEdgePadCells(inner);
    const padded: GroundWindFieldCache = { model, obstacles: periodicPadObstacles(inner, pad), grids: new Map(), builds: 0 };
    cache.flow = { inner, pad, padded, ratios: new Map() };
  }
  return cache.flow;
}

type PlanRatioJob = { step: (budgetMs: number) => boolean; ratio: () => Float32Array | null; flow: () => PlanFlow | null };

function createPlanRatioJob(model: CityModel, sector: number): PlanRatioJob {
  let flow: PlanFlow | null = null;
  let builder: GroundWindGridBuilder | null = null;
  let ratio: Float32Array | null = null;
  return {
    step(budgetMs) {
      if (ratio) return true;
      if (!flow) {
        flow = planFlow(model);
        ratio = flow.ratios.get(sector) ?? null;
        return ratio !== null;
      }
      builder ??= createGroundWindGridBuilder(flow.padded, sector);
      if (!builder.step(budgetMs)) return false;
      const grid = builder.finish();
      flow.padded.grids.delete(sector);
      ratio = windPlanRatioField(grid, flow.pad, flow.inner.cols, flow.inner.rows);
      flow.ratios.set(sector, ratio);
      return true;
    },
    ratio: () => ratio,
    flow: () => flow,
  };
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

export function windPlanDisplayField(ratio: Float32Array, geometry: WindPlanGeometry, referenceMs: number): Float32Array {
  const { cols, rows, cellM } = geometry;
  return windPlanSpeedField(gaussianBlur(ratio, cols, rows, WIND_PLAN_DISPLAY_SIGMA_M / cellM), referenceMs);
}

export function buildWindPlanRatio(model: CityModel, sector: number): { geometry: WindPlanGeometry; ratio: Float32Array } {
  const job = createPlanRatioJob(model, groundWindSector(sector));
  while (!job.step(Infinity));
  return { geometry: windPlanGeometry(job.flow()!.inner), ratio: job.ratio()! };
}

export function createWindPlanSpeedJob(
  model: CityModel,
  seasonKey: string,
  weights: WindSeasonWeights,
  sectorIn: number,
): WindPlanJob<WindPlanSpeed> | null {
  const sector = groundWindSector(sectorIn);
  const referenceMs = windPlanReferenceMs(weights, sector);
  if (referenceMs == null) return null;
  const key = windPlanSpeedKey(seasonKey, sector);
  const cache = planCache(model);
  let result = cache.speed.get(key) ?? null;
  const ratioJob = result ? null : createPlanRatioJob(model, sector);
  return {
    step(budgetMs) {
      if (result) return true;
      const start = now();
      while (!ratioJob!.step(Math.max(0, budgetMs - (now() - start)))) {
        if (now() - start >= budgetMs) return false;
      }
      const geometry = windPlanGeometry(ratioJob!.flow()!.inner);
      result = { key, sector, referenceMs, geometry, speedMs: windPlanDisplayField(ratioJob!.ratio()!, geometry, referenceMs) };
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
  let sectorAt = 0;
  let ratioJob: PlanRatioJob | null = null;
  let ratio: Float32Array | null = null;
  let row = 0;
  let geometry: WindPlanGeometry | null = null;
  let fields: ComfortFields | null = null;

  const work = (budgetMs: number): boolean => {
    if (!geometry) {
      const flow = planFlow(model);
      geometry = windPlanGeometry(flow.inner);
      fields = emptyComfortFields(geometry.cols, geometry.rows);
      return false;
    }
    if (sectorAt >= sectors.length) {
      result = finishWindPlanComfort(geometry, fields!, seasonKey);
      cache.comfort.set(seasonKey, result);
      return true;
    }
    const sector = sectors[sectorAt]!;
    if (!ratio) {
      ratioJob ??= createPlanRatioJob(model, sector);
      if (!ratioJob.step(budgetMs)) return false;
      ratio = ratioJob.ratio();
      ratioJob = null;
      row = 0;
      return false;
    }
    const { cols, rows } = geometry;
    const next = Math.min(rows, row + WIND_PLAN_ROWS_PER_SLICE);
    accumulateSectorExceedance(fields!, weights, sector, ratio, row * cols, next * cols, PEDESTRIAN_HEIGHT_FACTOR);
    row = next;
    if (row >= rows) {
      ratio = null;
      sectorAt += 1;
    }
    return false;
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

export function windPlanRampStops(colourRgb: (token: ColourKey) => { r: number; g: number; b: number }): RampStop[] {
  return WIND_PLAN_SPEED_RAMP.map((stop) => {
    const { r, g, b } = colourRgb(stop.token);
    return { ms: stop.ms, rgb: [r, g, b] };
  });
}

export function windPlanLegendGradient(colourOf: (token: ColourKey) => string): string {
  const stops = WIND_PLAN_SPEED_RAMP.map((s) => `${colourOf(s.token)} ${((s.ms / WIND_PLAN_SPEED_MAX_MS) * 100).toFixed(1)}%`);
  return `linear-gradient(to top, ${stops.join(", ")})`;
}

export function windPlanImageUpscale(cols: number, rows: number): number {
  const fit = Math.floor(Math.sqrt(WIND_PLAN_IMAGE_MAX_PIXELS / Math.max(1, cols * rows)));
  return Math.max(1, Math.min(WIND_PLAN_IMAGE_UPSCALE, fit));
}

export function bilinearSample(values: ArrayLike<number>, cols: number, rows: number, x: number, y: number): number {
  const cx = Math.min(cols - 1, Math.max(0, x));
  const cy = Math.min(rows - 1, Math.max(0, y));
  const i0 = Math.floor(cx);
  const j0 = Math.floor(cy);
  const i1 = Math.min(cols - 1, i0 + 1);
  const j1 = Math.min(rows - 1, j0 + 1);
  const tx = cx - i0;
  const ty = cy - j0;
  const top = values[j0 * cols + i0]! * (1 - tx) + values[j0 * cols + i1]! * tx;
  const bottom = values[j1 * cols + i0]! * (1 - tx) + values[j1 * cols + i1]! * tx;
  return top * (1 - ty) + bottom * ty;
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
