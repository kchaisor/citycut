import type { CityModel } from "../types";
import {
  createGroundWindGridBuilder,
  GROUND_WIND_CHANNEL_REACH_M,
  GROUND_WIND_CORNER_MAX_M,
  GROUND_WIND_LATERAL_REACH_M,
  GROUND_WIND_TREE_WAKE_HEIGHT_MULTIPLE,
  GROUND_WIND_WAKE_HEIGHT_MULTIPLE,
  GROUND_WIND_WAKE_MAX_M,
  GROUND_WIND_WAKE_MIN_M,
  groundWindFieldCache,
  groundWindObstaclesFromRasters,
  groundWindSector,
  rasterGroundWindObstacles,
  rasterGroundWindWater,
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
  sectorWindWeight,
  sectorReferenceSpeedMs,
  unsafeMask,
  type ComfortFields,
  type MaskComponent,
  type WindSeasonWeights,
} from "./windComfort";

export const WIND_PLAN_SPEED_MAX_MS = 4;
export const WIND_PLAN_SCALE_PERCENTILE = 0.995;
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

export function windPlanScaleMaxMs(peakMs: number): number {
  if (!Number.isFinite(peakMs) || peakMs <= WIND_PLAN_SPEED_MAX_MS) return WIND_PLAN_SPEED_MAX_MS;
  if (peakMs <= 6) return Math.ceil(peakMs);
  return Math.ceil(peakMs / 2) * 2;
}

export function windPlanSiteScaleMaxMs(viewPeaksMs: readonly number[]): number {
  const finite = viewPeaksMs.filter((peak) => Number.isFinite(peak));
  return windPlanScaleMaxMs(finite.length > 0 ? Math.max(...finite) : NaN);
}

export function windPlanSpeedTicks(scaleMaxMs: number): number[] {
  const step = [1, 2, 4, 5, 10, 20].find((s) => scaleMaxMs % s === 0 && scaleMaxMs / s <= 5) ?? 2;
  const ticks: number[] = [];
  for (let tick = 0; tick < scaleMaxMs; tick += step) ticks.push(tick);
  ticks.push(scaleMaxMs);
  return ticks;
}

export function windPlanContourStepMs(scaleMaxMs: number): number {
  if (scaleMaxMs <= WIND_PLAN_SPEED_MAX_MS) return 0.25;
  return scaleMaxMs <= 8 ? 0.5 : 1;
}

export function windPlanContourLevels(scaleMaxMs: number): number[] {
  const step = windPlanContourStepMs(scaleMaxMs);
  return Array.from({ length: Math.round(scaleMaxMs / step) - 1 }, (_, k) => (k + 1) * step);
}

export function windPlanSpeedRamp(scaleMaxMs: number): Array<{ token: ColourKey; ms: number }> {
  const stretch = scaleMaxMs / WIND_PLAN_SPEED_MAX_MS;
  return WIND_PLAN_SPEED_RAMP.map((stop) => ({ token: stop.token, ms: stop.ms * stretch }));
}

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

// Over open water alpha = 0.11, the near-neutral value measured at sea by Hsu, Meindl and Gilhousen (1994),
// "Determining the power-law wind-profile exponent under near-neutral stability conditions at sea",
// Journal of Applied Meteorology 33(6).
export const OPEN_WATER_PROFILE_ALPHA = 0.11;
export const WATER_PEDESTRIAN_HEIGHT_FACTOR = powerLawHeightFactor(STATION_HEIGHT_M, PEDESTRIAN_HEIGHT_M, OPEN_WATER_PROFILE_ALPHA);
export const WATER_SHORE_BLEND_M = 60;
export const WIND_PLAN_WATER_VERSION = 2;

export function pedestrianHeightFactorAt(waterDistanceM: number): number {
  const t = Math.max(0, 1 - waterDistanceM / WATER_SHORE_BLEND_M);
  return PEDESTRIAN_HEIGHT_FACTOR + (WATER_PEDESTRIAN_HEIGHT_FACTOR - PEDESTRIAN_HEIGHT_FACTOR) * t;
}

export function waterDistanceField(water: Uint8Array, cols: number, rows: number, cellM: number): Float32Array {
  const dist = new Float32Array(water.length);
  for (let idx = 0; idx < water.length; idx++) dist[idx] = water[idx] ? 0 : Infinity;
  const diag = cellM * Math.SQRT2;
  const relax = (idx: number, i: number, j: number, di: number, dj: number, step: number) => {
    const x = i + di;
    const y = j + dj;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const d = dist[y * cols + x]! + step;
    if (d < dist[idx]!) dist[idx] = d;
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      relax(idx, i, j, -1, 0, cellM);
      relax(idx, i, j, 0, -1, cellM);
      relax(idx, i, j, -1, -1, diag);
      relax(idx, i, j, 1, -1, diag);
    }
  }
  for (let j = rows - 1; j >= 0; j--) {
    for (let i = cols - 1; i >= 0; i--) {
      const idx = j * cols + i;
      relax(idx, i, j, 1, 0, cellM);
      relax(idx, i, j, 0, 1, cellM);
      relax(idx, i, j, 1, 1, diag);
      relax(idx, i, j, -1, 1, diag);
    }
  }
  return dist;
}

export function pedestrianHeightFactors(water: Uint8Array, cols: number, rows: number, cellM: number): Float32Array | null {
  if (!water.some((cell) => cell === 1)) return null;
  const dist = waterDistanceField(water, cols, rows, cellM);
  const out = new Float32Array(dist.length);
  for (let idx = 0; idx < out.length; idx++) out[idx] = pedestrianHeightFactorAt(dist[idx]!);
  return out;
}

export function pedestrianReferenceMs(stationMs: number): number {
  return stationMs * PEDESTRIAN_HEIGHT_FACTOR;
}

export function windPlanReferenceMs(weights: WindSeasonWeights, sector: number): number | null {
  const stationMs = sectorReferenceSpeedMs(weights, sector);
  return stationMs == null ? null : pedestrianReferenceMs(stationMs);
}

export type WindPlanMode = "speed" | "comfort";

export type WindPlanGeometry = Pick<GroundWindObstacles, "cols" | "rows" | "cellM" | "originE" | "originN" | "solid"> & {
  water: Uint8Array;
};

export function windPlanPaintsCell(geometry: Pick<WindPlanGeometry, "solid" | "water">, idx: number): boolean {
  return !geometry.solid[idx] && !geometry.water[idx];
}

export function windPlanUnpaintedMask(geometry: Pick<WindPlanGeometry, "solid" | "water">): Uint8Array {
  const mask = new Uint8Array(geometry.solid.length);
  for (let idx = 0; idx < mask.length; idx++) mask[idx] = windPlanPaintsCell(geometry, idx) ? 0 : 1;
  return mask;
}

export type WindPlanFlow = { east: Float32Array; north: Float32Array; speedMs: Float32Array };

export type WindPlanSpeed = {
  key: string;
  sector: number;
  referenceMs: number;
  geometry: WindPlanGeometry;
  speedMs: Float32Array;
  flow: WindPlanFlow;
};

export type WindPlanComfort = {
  key: string;
  geometry: WindPlanGeometry;
  fields: ComfortFields;
  unsafeAreas: MaskComponent[];
  flow: WindPlanFlow;
};

export type WindPlanFlowDirections = { east: Float32Array; north: Float32Array };

export type WindPlanJob<T> = {
  step: (budgetMs: number) => boolean;
  result: () => T | null;
};

export type WindPlanView = { sector: number; referenceMs: number };

type PlanFlow = {
  inner: GroundWindObstacles;
  fingerprint: string;
  pad: number;
  padded: GroundWindFieldCache;
  ratios: Map<number, Float32Array>;
  directions: Map<number, WindPlanFlowDirections>;
  water: Uint8Array;
  heightFactors: Float32Array | null;
};

type PlanCache = {
  flow: PlanFlow | null;
  speed: Map<string, WindPlanSpeed>;
  comfort: Map<string, WindPlanComfort>;
};

const SITE_CACHE_LIMIT = 64;
const siteScaleRatios = new Map<string, number>();
const siteScales = new Map<string, number>();

function rememberSite<T>(store: Map<string, T>, key: string, value: T) {
  store.delete(key);
  store.set(key, value);
  if (store.size > SITE_CACHE_LIMIT) store.delete(store.keys().next().value!);
}

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
  const reachM = Math.min(GROUND_WIND_WAKE_MAX_M, Math.max(GROUND_WIND_WAKE_MIN_M, wakeM)) +
    Math.max(GROUND_WIND_LATERAL_REACH_M, GROUND_WIND_CHANNEL_REACH_M, GROUND_WIND_CORNER_MAX_M);
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

export function windPlanFlowDirections(grid: GroundWindFlowGrid, pad: number, cols: number, rows: number): WindPlanFlowDirections {
  const { cols: paddedCols, rows: paddedRows } = grid.obstacles;
  const east = boxBlur3(grid.flowE, paddedCols, paddedRows);
  const north = boxBlur3(grid.flowN, paddedCols, paddedRows);
  return { east: cropPadded(east, paddedCols, pad, cols, rows), north: cropPadded(north, paddedCols, pad, cols, rows) };
}

function hashWords(hash: number, words: Uint32Array): number {
  let h = hash;
  for (let k = 0; k < words.length; k++) h = Math.imul(h ^ words[k]!, 0x01000193) >>> 0;
  return h;
}

export function windPlanSiteFingerprint(obs: GroundWindObstacles, water: Uint8Array): string {
  const waterWords = new Uint32Array(water.length);
  waterWords.set(water);
  let h = 0x811c9dc5;
  h = hashWords(h, new Uint32Array(obs.heights.buffer, obs.heights.byteOffset, obs.heights.length));
  h = hashWords(h, new Uint32Array(obs.canopy.buffer, obs.canopy.byteOffset, obs.canopy.length));
  h = hashWords(h, waterWords);
  let cells = 0;
  for (let idx = 0; idx < water.length; idx++) cells += water[idx]! + obs.solid[idx]! * 2;
  return `${obs.cols}x${obs.rows}@${obs.cellM}:${obs.originE},${obs.originN}:${cells}:${h.toString(16)}`;
}

function planFlow(model: CityModel): PlanFlow {
  const cache = planCache(model);
  if (!cache.flow) {
    const shared = groundWindFieldCache(model);
    shared.obstacles ??= rasterGroundWindObstacles(model);
    const inner = shared.obstacles;
    const pad = windPlanEdgePadCells(inner);
    const padded: GroundWindFieldCache = { model, obstacles: periodicPadObstacles(inner, pad), grids: new Map(), builds: 0 };
    const water = rasterGroundWindWater(model, inner, inner.solid);
    const heightFactors = pedestrianHeightFactors(water, inner.cols, inner.rows, inner.cellM);
    const fingerprint = windPlanSiteFingerprint(inner, water);
    cache.flow = { inner, fingerprint, pad, padded, ratios: new Map(), directions: new Map(), water, heightFactors };
  }
  return cache.flow;
}

type PlanRatioJob = {
  step: (budgetMs: number) => boolean;
  ratio: () => Float32Array | null;
  directions: () => WindPlanFlowDirections | null;
  flow: () => PlanFlow | null;
};

function createPlanRatioJob(model: CityModel, sector: number): PlanRatioJob {
  let flow: PlanFlow | null = null;
  let builder: GroundWindGridBuilder | null = null;
  let ratio: Float32Array | null = null;
  let directions: WindPlanFlowDirections | null = null;
  return {
    step(budgetMs) {
      if (ratio && directions) return true;
      if (!flow) {
        flow = planFlow(model);
        ratio = flow.ratios.get(sector) ?? null;
        directions = flow.directions.get(sector) ?? null;
        return ratio !== null && directions !== null;
      }
      builder ??= createGroundWindGridBuilder(flow.padded, sector);
      if (!builder.step(budgetMs)) return false;
      const grid = builder.finish();
      flow.padded.grids.delete(sector);
      ratio = windPlanRatioField(grid, flow.pad, flow.inner.cols, flow.inner.rows);
      directions = windPlanFlowDirections(grid, flow.pad, flow.inner.cols, flow.inner.rows);
      flow.ratios.set(sector, ratio);
      flow.directions.set(sector, directions);
      return true;
    },
    ratio: () => ratio,
    directions: () => directions,
    flow: () => flow,
  };
}

export function windPlanGeometry(obs: GroundWindObstacles, water: Uint8Array = new Uint8Array(obs.solid.length)): WindPlanGeometry {
  return { cols: obs.cols, rows: obs.rows, cellM: obs.cellM, originE: obs.originE, originN: obs.originN, solid: obs.solid, water };
}

export function windPlanSpeedField(ratio: ArrayLike<number>, referenceMs: number): Float32Array {
  const out = new Float32Array(ratio.length);
  for (let idx = 0; idx < out.length; idx++) out[idx] = ratio[idx]! * referenceMs;
  return out;
}

export function windPlanSpeedKey(seasonKey: string, sector: number): string {
  return `${seasonKey}:${groundWindSector(sector)}`;
}

function modelHasWater(model: CityModel): boolean {
  return model.areas.some((area) => area.kind === "water");
}

function surfaceKey(model: CityModel, key: string): string {
  return modelHasWater(model) ? `${key}:water-v${WIND_PLAN_WATER_VERSION}` : key;
}

export function cachedWindPlanSpeed(model: CityModel, key: string): WindPlanSpeed | null {
  return planCache(model).speed.get(surfaceKey(model, key)) ?? null;
}

export function cachedWindPlanComfort(model: CityModel, key: string): WindPlanComfort | null {
  return planCache(model).comfort.get(surfaceKey(model, key)) ?? null;
}

export function windPlanDisplayField(
  ratio: Float32Array,
  geometry: WindPlanGeometry,
  referenceMs: number,
  heightFactors: Float32Array | null = null,
): Float32Array {
  const { cols, rows, cellM } = geometry;
  const speed = windPlanSpeedField(gaussianBlur(ratio, cols, rows, WIND_PLAN_DISPLAY_SIGMA_M / cellM), referenceMs);
  if (heightFactors) for (let idx = 0; idx < speed.length; idx++) speed[idx] = speed[idx]! * (heightFactors[idx]! / PEDESTRIAN_HEIGHT_FACTOR);
  return speed;
}

export function windPlanFieldPercentile(values: ArrayLike<number>, unpainted: Uint8Array, fraction: number): number {
  const open: number[] = [];
  for (let idx = 0; idx < values.length; idx++) if (!unpainted[idx] && Number.isFinite(values[idx]!)) open.push(values[idx]!);
  if (open.length === 0) return NaN;
  open.sort((a, b) => a - b);
  return open[Math.min(open.length - 1, Math.max(0, Math.ceil(fraction * open.length) - 1))]!;
}

export function windPlanScaleRatio(ratio: Float32Array, geometry: WindPlanGeometry, heightFactors: Float32Array | null = null): number {
  return windPlanFieldPercentile(windPlanDisplayField(ratio, geometry, 1, heightFactors), windPlanUnpaintedMask(geometry), WIND_PLAN_SCALE_PERCENTILE);
}

export function windPlanScaleKey(views: readonly WindPlanView[]): string {
  return views.map((view) => `${groundWindSector(view.sector)}@${view.referenceMs.toFixed(4)}`).join(",");
}

export function cachedWindPlanScale(model: CityModel, key: string): number | null {
  const flow = planCache(model).flow;
  return flow ? (siteScales.get(`${flow.fingerprint}|${key}`) ?? null) : null;
}

export function createWindPlanScaleJob(model: CityModel, views: readonly WindPlanView[]): WindPlanJob<number> {
  const viewsKey = windPlanScaleKey(views);
  const sectors = [...new Set(views.map((view) => groundWindSector(view.sector)))];
  let result = cachedWindPlanScale(model, viewsKey);
  let sectorAt = 0;
  let ratioJob: PlanRatioJob | null = null;

  const work = (budgetMs: number): boolean => {
    const flow = planFlow(model);
    const scaleKey = `${flow.fingerprint}|${viewsKey}`;
    const ratioKey = (sector: number) => `${flow.fingerprint}|${sector}`;
    result = siteScales.get(scaleKey) ?? null;
    if (result !== null) return true;
    if (sectorAt >= sectors.length) {
      const peaks = views.map((view) => view.referenceMs * siteScaleRatios.get(ratioKey(groundWindSector(view.sector)))!);
      result = windPlanSiteScaleMaxMs(peaks);
      rememberSite(siteScales, scaleKey, result);
      return true;
    }
    const sector = sectors[sectorAt]!;
    if (!siteScaleRatios.has(ratioKey(sector))) {
      ratioJob ??= createPlanRatioJob(model, sector);
      if (!ratioJob.step(budgetMs)) return false;
      rememberSite(siteScaleRatios, ratioKey(sector), windPlanScaleRatio(ratioJob.ratio()!, windPlanGeometry(flow.inner, flow.water), flow.heightFactors));
      ratioJob = null;
    }
    sectorAt += 1;
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

export function buildWindPlanRatio(
  model: CityModel,
  sector: number,
): { geometry: WindPlanGeometry; ratio: Float32Array; directions: WindPlanFlowDirections } {
  const job = createPlanRatioJob(model, groundWindSector(sector));
  while (!job.step(Infinity));
  const flow = job.flow()!;
  return { geometry: windPlanGeometry(flow.inner, flow.water), ratio: job.ratio()!, directions: job.directions()! };
}

export function createWindPlanSpeedJob(
  model: CityModel,
  seasonKey: string,
  referenceMs: number | null,
  sectorIn: number,
): WindPlanJob<WindPlanSpeed> | null {
  const sector = groundWindSector(sectorIn);
  if (referenceMs == null) return null;
  const key = windPlanSpeedKey(seasonKey, sector);
  const cacheKey = surfaceKey(model, key);
  const cache = planCache(model);
  let result = cache.speed.get(cacheKey) ?? null;
  const ratioJob = result ? null : createPlanRatioJob(model, sector);
  return {
    step(budgetMs) {
      if (result) return true;
      const start = now();
      while (!ratioJob!.step(Math.max(0, budgetMs - (now() - start)))) {
        if (now() - start >= budgetMs) return false;
      }
      const flow = ratioJob!.flow()!;
      const geometry = windPlanGeometry(flow.inner, flow.water);
      const speedMs = windPlanDisplayField(ratioJob!.ratio()!, geometry, referenceMs, flow.heightFactors);
      const directions = ratioJob!.directions()!;
      result = { key, sector, referenceMs, geometry, speedMs, flow: { east: directions.east, north: directions.north, speedMs } };
      cache.speed.set(cacheKey, result);
      return true;
    },
    result: () => result,
  };
}

export function emptyWindPlanFlow(cells: number): WindPlanFlow {
  return { east: new Float32Array(cells), north: new Float32Array(cells), speedMs: new Float32Array(cells) };
}

export function accumulateSectorFlow(
  flow: WindPlanFlow,
  directions: WindPlanFlowDirections,
  ratio: ArrayLike<number>,
  weightMs: number,
  heightFactors: Float32Array | number,
): void {
  if (!(weightMs > 0)) return;
  for (let idx = 0; idx < flow.speedMs.length; idx++) {
    const e = directions.east[idx]!;
    const n = directions.north[idx]!;
    const length = Math.hypot(e, n);
    const hf = typeof heightFactors === "number" ? heightFactors : heightFactors[idx]!;
    const ms = weightMs * ratio[idx]! * hf;
    flow.speedMs[idx] = flow.speedMs[idx]! + ms;
    if (length > 1e-6) {
      flow.east[idx] = flow.east[idx]! + (ms * e) / length;
      flow.north[idx] = flow.north[idx]! + (ms * n) / length;
    }
  }
}

export function finishWindPlanComfort(geometry: WindPlanGeometry, fields: ComfortFields, key: string, flow?: WindPlanFlow): WindPlanComfort {
  const { cols, rows } = geometry;
  const unpainted = windPlanUnpaintedMask(geometry);
  for (let idx = 0; idx < unpainted.length; idx++) if (unpainted[idx]) fields.p15[idx] = 0;
  return {
    key,
    geometry,
    fields,
    unsafeAreas: maskComponents(unsafeMask(fields, unpainted), cols, rows),
    flow: flow ?? emptyWindPlanFlow(cols * rows),
  };
}

export function createWindPlanComfortJob(model: CityModel, seasonKey: string, weights: WindSeasonWeights): WindPlanJob<WindPlanComfort> {
  const cache = planCache(model);
  const cacheKey = surfaceKey(model, seasonKey);
  let result = cache.comfort.get(cacheKey) ?? null;
  const sectors = [...new Set(weights.bins.map((bin) => bin.sector))];
  let sectorAt = 0;
  let ratioJob: PlanRatioJob | null = null;
  let ratio: Float32Array | null = null;
  let row = 0;
  let geometry: WindPlanGeometry | null = null;
  let fields: ComfortFields | null = null;
  let flowSum: WindPlanFlow | null = null;
  let heightFactors: Float32Array | number = PEDESTRIAN_HEIGHT_FACTOR;
  const totalWeight = weights.bins.reduce((sum, bin) => sum + bin.weight, 0);

  const work = (budgetMs: number): boolean => {
    if (!geometry) {
      const flow = planFlow(model);
      geometry = windPlanGeometry(flow.inner, flow.water);
      heightFactors = flow.heightFactors ?? PEDESTRIAN_HEIGHT_FACTOR;
      fields = emptyComfortFields(geometry.cols, geometry.rows);
      flowSum = emptyWindPlanFlow(geometry.cols * geometry.rows);
      return false;
    }
    if (sectorAt >= sectors.length) {
      result = finishWindPlanComfort(geometry, fields!, seasonKey, flowSum!);
      cache.comfort.set(cacheKey, result);
      return true;
    }
    const sector = sectors[sectorAt]!;
    if (!ratio) {
      ratioJob ??= createPlanRatioJob(model, sector);
      if (!ratioJob.step(budgetMs)) return false;
      ratio = ratioJob.ratio();
      if (totalWeight > 0) accumulateSectorFlow(flowSum!, ratioJob.directions()!, ratio!, sectorWindWeight(weights, sector) / totalWeight, heightFactors);
      ratioJob = null;
      row = 0;
      return false;
    }
    const { cols, rows } = geometry;
    const next = Math.min(rows, row + WIND_PLAN_ROWS_PER_SLICE);
    accumulateSectorExceedance(fields!, weights, sector, ratio, row * cols, next * cols, heightFactors);
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

export function windPlanRampStops(
  colourRgb: (token: ColourKey) => { r: number; g: number; b: number },
  scaleMaxMs: number = WIND_PLAN_SPEED_MAX_MS,
): RampStop[] {
  return windPlanSpeedRamp(scaleMaxMs).map((stop) => {
    const { r, g, b } = colourRgb(stop.token);
    return { ms: stop.ms, rgb: [r, g, b] };
  });
}

export type WindPlanLegendStop = { token: ColourKey; pct: number };

export function windPlanLegendStops(scaleMaxMs: number = WIND_PLAN_SPEED_MAX_MS): WindPlanLegendStop[] {
  return windPlanSpeedRamp(scaleMaxMs).map((stop) => ({ token: stop.token, pct: (stop.ms / scaleMaxMs) * 100 }));
}

export function windPlanLegendGradient(
  colourOf: (token: ColourKey) => string,
  scaleMaxMs: number = WIND_PLAN_SPEED_MAX_MS,
  direction: "to right" | "to top" = "to right",
): string {
  const stops = windPlanLegendStops(scaleMaxMs).map((stop) => `${colourOf(stop.token)} ${Number(stop.pct.toFixed(3))}%`);
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
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
