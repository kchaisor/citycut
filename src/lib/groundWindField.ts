import type { CityModel, Ring } from "../types";
import { downwindFromSector, WIND_SECTOR_COUNT } from "./windRose";
import { sampleTerrain } from "./terrain";

export const GROUND_WIND_DEFAULT_SECTOR = 0;
export const GROUND_WIND_CELL_MIN_M = 2;
export const GROUND_WIND_CELL_MAX_M = 4;
export const GROUND_WIND_CELLS_TARGET = 320;
export const GROUND_WIND_BLUR_RADIUS_M = 6;
export const GROUND_WIND_TREE_WEIGHT = 0.4;
export const GROUND_WIND_DEFLECT_GAIN = 2.2;
export const GROUND_WIND_WINDWARD_SLOW = 0.6;
export const GROUND_WIND_LATERAL_REACH_M = 24;
export const GROUND_WIND_SIDE_BOOST = 0.2;
export const GROUND_WIND_CHANNEL_BOOST = 0.5;
export const GROUND_WIND_CHANNEL_REACH_M = 40;
export const GROUND_WIND_CORNER_BOOST = 0.7;
export const GROUND_WIND_CORNER_MIN_M = 16;
export const GROUND_WIND_CORNER_MAX_M = 48;
export const GROUND_WIND_BUILDING_SHELTER_FLOOR = 0.14;
export const GROUND_WIND_TREE_SHELTER_FLOOR = 0.8;
export const GROUND_WIND_WAKE_HEIGHT_MULTIPLE = 4;
export const GROUND_WIND_TREE_WAKE_HEIGHT_MULTIPLE = 1.5;
export const GROUND_WIND_WAKE_MIN_M = 12;
export const GROUND_WIND_WAKE_MAX_M = 240;
export const GROUND_WIND_WAKE_SPREAD = 0.12;
export const GROUND_WIND_WAKE_SPREAD_MAX_M = 16;
export const GROUND_WIND_SPEED_MIN = 0.12;
export const GROUND_WIND_ROWS_PER_SLICE = 24;

export type WindVector = { east: number; north: number };

export type GroundWindObstacles = {
  cols: number;
  rows: number;
  cellM: number;
  originE: number;
  originN: number;
  solid: Uint8Array;
  heights: Float32Array;
  canopy: Float32Array;
  gradE: Float32Array;
  gradN: Float32Array;
  fluidCells: Int32Array;
};

export type GroundWindFlowGrid = {
  sector: number;
  base: WindVector;
  obstacles: GroundWindObstacles;
  flowE: Float32Array;
  flowN: Float32Array;
  speed: Float32Array;
};

export type GroundWindFlowSample = { east: number; north: number; speed: number };

export type GroundWindGridBuilder = {
  step: (budgetMs: number) => boolean;
  finish: () => GroundWindFlowGrid;
};

export type GroundWindFieldCache = {
  model: CityModel;
  obstacles: GroundWindObstacles | null;
  grids: Map<number, GroundWindFlowGrid>;
  builds: number;
};

const caches = new WeakMap<CityModel, GroundWindFieldCache>();

export function groundWindFieldCache(model: CityModel): GroundWindFieldCache {
  let cache = caches.get(model);
  if (!cache) {
    cache = { model, obstacles: null, grids: new Map(), builds: 0 };
    caches.set(model, cache);
  }
  return cache;
}

export function groundWindSector(sector: number | undefined): number {
  const s = Math.round(sector ?? GROUND_WIND_DEFAULT_SECTOR);
  return ((s % WIND_SECTOR_COUNT) + WIND_SECTOR_COUNT) % WIND_SECTOR_COUNT;
}

export function groundWindCellM(sideM: number): number {
  return Math.min(GROUND_WIND_CELL_MAX_M, Math.max(GROUND_WIND_CELL_MIN_M, sideM / GROUND_WIND_CELLS_TARGET));
}

function rasterRing(ring: Ring, grid: { cols: number; rows: number; cellM: number; originE: number; originN: number }, value: number, out: Float32Array) {
  const { cols, rows, cellM, originE, originN } = grid;
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
        if (out[idx]! < value) out[idx] = value;
      }
    }
  }
}

function rasterDisc(east: number, north: number, radiusM: number, grid: { cols: number; rows: number; cellM: number; originE: number; originN: number }, value: number, out: Float32Array) {
  const { cols, rows, cellM, originE, originN } = grid;
  const r = Math.max(radiusM, cellM * 0.5);
  const i0 = Math.max(0, Math.floor((east - r - originE) / cellM));
  const i1 = Math.min(cols - 1, Math.floor((east + r - originE) / cellM));
  const j0 = Math.max(0, Math.floor((north - r - originN) / cellM));
  const j1 = Math.min(rows - 1, Math.floor((north + r - originN) / cellM));
  for (let j = j0; j <= j1; j++) {
    const dn = originN + (j + 0.5) * cellM - north;
    for (let i = i0; i <= i1; i++) {
      const de = originE + (i + 0.5) * cellM - east;
      if (de * de + dn * dn > r * r) continue;
      const idx = j * cols + i;
      if (out[idx]! < value) out[idx] = value;
    }
  }
}

function boxBlur(values: Float32Array, cols: number, rows: number, radius: number): Float32Array {
  const tmp = new Float32Array(values.length);
  const out = new Float32Array(values.length);
  const span = radius * 2 + 1;
  for (let j = 0; j < rows; j++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += values[j * cols + Math.min(cols - 1, Math.max(0, k))]!;
    for (let i = 0; i < cols; i++) {
      tmp[j * cols + i] = sum / span;
      sum += values[j * cols + Math.min(cols - 1, i + radius + 1)]! - values[j * cols + Math.max(0, i - radius)]!;
    }
  }
  for (let i = 0; i < cols; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(rows - 1, Math.max(0, k)) * cols + i]!;
    for (let j = 0; j < rows; j++) {
      out[j * cols + i] = sum / span;
      sum += tmp[Math.min(rows - 1, j + radius + 1) * cols + i]! - tmp[Math.max(0, j - radius) * cols + i]!;
    }
  }
  return out;
}

export type GroundWindRasterGrid = { cols: number; rows: number; cellM: number; originE: number; originN: number };

export function rasterGroundWindObstacles(model: CityModel): GroundWindObstacles {
  const w = model.widthM ?? model.sideM;
  const h = model.heightM ?? model.sideM;
  const cellM = groundWindCellM(Math.max(w, h));
  const cols = Math.max(4, Math.ceil(w / cellM));
  const rows = Math.max(4, Math.ceil(h / cellM));
  const grid = { cols, rows, cellM, originE: -w / 2, originN: -h / 2 };
  const heights = new Float32Array(cols * rows);
  for (const building of model.buildings) rasterRing(building.ring, grid, Math.max(3, building.height), heights);
  const canopy = new Float32Array(cols * rows);
  for (const tree of model.trees) {
    rasterDisc(tree.at[0], tree.at[1], tree.crown_diameter_m / 2, grid, Math.max(2, tree.height_m), canopy);
  }
  return groundWindObstaclesFromRasters(grid, heights, canopy);
}

export function rasterGroundWindWater(model: CityModel, grid: GroundWindRasterGrid, solid: Uint8Array): Uint8Array {
  const n = grid.cols * grid.rows;
  const water = new Uint8Array(n);
  const outer = new Float32Array(n);
  const holes = new Float32Array(n);
  for (const area of model.areas) {
    if (area.kind !== "water") continue;
    outer.fill(0);
    holes.fill(0);
    rasterRing(area.ring, grid, 1, outer);
    for (const hole of area.holes) rasterRing(hole, grid, 1, holes);
    for (let idx = 0; idx < n; idx++) if (outer[idx]! > 0 && !(holes[idx]! > 0) && !solid[idx]) water[idx] = 1;
  }
  return water;
}

export const GROUND_WIND_WATER_ALPHA = 0.3;

export function groundWindWaterAlpha(overWater: boolean): number {
  return overWater ? GROUND_WIND_WATER_ALPHA : 1;
}

const waterMasks = new WeakMap<GroundWindObstacles, Uint8Array>();

export function groundWindWaterMask(model: CityModel, obs: GroundWindObstacles): Uint8Array {
  let mask = waterMasks.get(obs);
  if (!mask) {
    mask = rasterGroundWindWater(model, obs, obs.solid);
    waterMasks.set(obs, mask);
  }
  return mask;
}

export function groundWindIsWater(obs: GroundWindObstacles, mask: Uint8Array, east: number, north: number): boolean {
  const idx = groundWindCellIndex(obs, east, north);
  return idx >= 0 && mask[idx] === 1;
}

export function groundWindObstaclesFromRasters(grid: GroundWindRasterGrid, heights: Float32Array, canopy: Float32Array): GroundWindObstacles {
  const { cols, rows, cellM } = grid;
  const solid = new Uint8Array(cols * rows);
  const obstacle = new Float32Array(cols * rows);
  const fluid: number[] = [];
  for (let idx = 0; idx < heights.length; idx++) {
    solid[idx] = heights[idx]! > 0 ? 1 : 0;
    obstacle[idx] = solid[idx] ? 1 : canopy[idx]! > 0 ? GROUND_WIND_TREE_WEIGHT : 0;
    if (!solid[idx]) fluid.push(idx);
  }
  const radius = Math.max(1, Math.round(GROUND_WIND_BLUR_RADIUS_M / cellM));
  const blurred = boxBlur(boxBlur(obstacle, cols, rows, radius), cols, rows, radius);
  const gradE = new Float32Array(cols * rows);
  const gradN = new Float32Array(cols * rows);
  const scale = (radius * 2 + 1) / 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      const e = blurred[j * cols + Math.min(cols - 1, i + 1)]!;
      const wv = blurred[j * cols + Math.max(0, i - 1)]!;
      const n = blurred[Math.min(rows - 1, j + 1) * cols + i]!;
      const s = blurred[Math.max(0, j - 1) * cols + i]!;
      gradE[idx] = (e - wv) * scale;
      gradN[idx] = (n - s) * scale;
    }
  }
  return { ...grid, solid, heights, canopy, gradE, gradN, fluidCells: Int32Array.from(fluid) };
}

function shelterField(obs: GroundWindObstacles, base: WindVector): Float32Array {
  const { cols, rows, cellM, solid, heights, canopy } = obs;
  const shelter = new Float32Array(cols * rows).fill(1);
  const stepE = base.east;
  const stepN = base.north;
  const perpE = -stepN;
  const perpN = stepE;
  const spreadMaxCells = Math.round(GROUND_WIND_WAKE_SPREAD_MAX_M / cellM);
  const shade = (x: number, y: number, factor: number): boolean => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const idx = y * cols + x;
    if (solid[idx]) return false;
    if (factor < shelter[idx]!) shelter[idx] = factor;
    return true;
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      const building = solid[idx] === 1;
      if (!building && canopy[idx]! <= 0) continue;
      const li = i + Math.round(stepE);
      const lj = j + Math.round(stepN);
      if (li < 0 || lj < 0 || li >= cols || lj >= rows) continue;
      const lee = lj * cols + li;
      if (solid[lee] || (!building && canopy[lee]! > 0)) continue;
      const height = building ? heights[idx]! : canopy[idx]!;
      const floor = building ? GROUND_WIND_BUILDING_SHELTER_FLOOR : GROUND_WIND_TREE_SHELTER_FLOOR;
      const multiple = building ? GROUND_WIND_WAKE_HEIGHT_MULTIPLE : GROUND_WIND_TREE_WAKE_HEIGHT_MULTIPLE;
      const wakeM = Math.min(GROUND_WIND_WAKE_MAX_M, Math.max(GROUND_WIND_WAKE_MIN_M, height * multiple));
      const steps = Math.ceil(wakeM / cellM);
      for (let s = 1; s <= steps; s++) {
        const cx = i + stepE * s;
        const cy = j + stepN * s;
        const t = s / steps;
        const factor = floor + (1 - floor) * t * t;
        if (!shade(Math.round(cx), Math.round(cy), factor)) break;
        const spread = Math.min(spreadMaxCells, Math.floor(s * GROUND_WIND_WAKE_SPREAD));
        for (let k = 1; k <= spread; k++) {
          const edge = k / (spread + 1);
          const side = factor + (1 - factor) * edge * edge;
          shade(Math.round(cx + perpE * k), Math.round(cy + perpN * k), side);
          shade(Math.round(cx - perpE * k), Math.round(cy - perpN * k), side);
        }
      }
    }
  }
  return shelter;
}

type SolidBlob = { members: Int32Array; tallest: number };

const solidBlobs = new WeakMap<GroundWindObstacles, SolidBlob[]>();

function blobsOf(obs: GroundWindObstacles): SolidBlob[] {
  const cached = solidBlobs.get(obs);
  if (cached) return cached;
  const { cols, rows, solid, heights } = obs;
  const seen = new Uint8Array(cols * rows);
  const stack: number[] = [];
  const blobs: SolidBlob[] = [];
  for (let start = 0; start < solid.length; start++) {
    if (!solid[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let tallest = 0;
    const members: number[] = [];
    while (stack.length > 0) {
      const idx = stack.pop()!;
      members.push(idx);
      tallest = Math.max(tallest, heights[idx]!);
      const i = idx % cols;
      const j = (idx - i) / cols;
      const visit = (n: number) => {
        if (solid[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      };
      if (i > 0) visit(idx - 1);
      if (i + 1 < cols) visit(idx + 1);
      if (j > 0) visit(idx - cols);
      if (j + 1 < rows) visit(idx + cols);
    }
    blobs.push({ members: Int32Array.from(members), tallest });
  }
  solidBlobs.set(obs, blobs);
  return blobs;
}

function cornerField(obs: GroundWindObstacles, base: WindVector): Float32Array {
  const { cols, cellM } = obs;
  const corner = new Float32Array(obs.cols * obs.rows);
  const perpE = -base.north;
  const perpN = base.east;
  for (const { members, tallest } of blobsOf(obs)) {
    let minC = Infinity;
    let maxC = -Infinity;
    for (const idx of members) {
      const i = idx % cols;
      const c = i * perpE + ((idx - i) / cols) * perpN;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
    const reachM = Math.min(GROUND_WIND_CORNER_MAX_M, Math.max(GROUND_WIND_CORNER_MIN_M, tallest));
    for (const [edgeC, sign] of [
      [minC, -1],
      [maxC, 1],
    ] as const) {
      let best = -1;
      let bestA = Infinity;
      for (const idx of members) {
        const i = idx % cols;
        const j = (idx - i) / cols;
        const offset = Math.abs(i * perpE + j * perpN - edgeC);
        if (offset > 1) continue;
        const a = i * base.east + j * base.north + offset;
        if (a < bestA) {
          bestA = a;
          best = idx;
        }
      }
      if (best >= 0) stampCorner(obs, corner, best % cols, Math.floor(best / cols), base, sign, reachM / cellM);
    }
  }
  return corner;
}

function stampCorner(obs: GroundWindObstacles, corner: Float32Array, ci: number, cj: number, base: WindVector, sign: number, reach: number) {
  const { cols, rows, solid } = obs;
  const perpE = -base.north * sign;
  const perpN = base.east * sign;
  const along = reach * 1.5;
  const across = reach * 0.75;
  const r = Math.ceil(along);
  for (let y = Math.max(0, cj - r); y <= Math.min(rows - 1, cj + r); y++) {
    for (let x = Math.max(0, ci - r); x <= Math.min(cols - 1, ci + r); x++) {
      const idx = y * cols + x;
      if (solid[idx]) continue;
      const a = (x - ci) * base.east + (y - cj) * base.north;
      const c = (x - ci) * perpE + (y - cj) * perpN;
      if (c < 0 || a < -across) continue;
      const da = a / (a < 0 ? across : along);
      const dc = c / across;
      const fade = 1 - da * da - dc * dc;
      if (fade <= 0) continue;
      const boost = GROUND_WIND_CORNER_BOOST * fade * fade;
      if (boost > corner[idx]!) corner[idx] = boost;
    }
  }
}

type ProbeSteps = { di: Int32Array; dj: Int32Array };

function probeSteps(dirE: number, dirN: number, reachSteps: number): ProbeSteps {
  const di = new Int32Array(reachSteps);
  const dj = new Int32Array(reachSteps);
  for (let s = 1; s <= reachSteps; s++) {
    di[s - 1] = Math.round(dirE * s);
    dj[s - 1] = Math.round(dirN * s);
  }
  return { di, dj };
}

function lateralClearM(obs: GroundWindObstacles, i: number, j: number, probe: ProbeSteps): number {
  const { cols, rows, cellM, solid } = obs;
  const { di, dj } = probe;
  for (let s = 0; s < di.length; s++) {
    const x = i + di[s]!;
    const y = j + dj[s]!;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return Infinity;
    if (solid[y * cols + x]) return (s + 1) * cellM;
  }
  return Infinity;
}

type GroundWindPrep = { shelter: Float32Array; corner: Float32Array };

function flowRows(obs: GroundWindObstacles, base: WindVector, prep: GroundWindPrep, grid: GroundWindFlowGrid, j0: number, j1: number) {
  const { cols, solid, gradE, gradN } = obs;
  const { shelter, corner } = prep;
  const reachM = GROUND_WIND_LATERAL_REACH_M;
  const channelM = GROUND_WIND_CHANNEL_REACH_M;
  const reachSteps = Math.ceil(Math.max(reachM, channelM) / obs.cellM);
  const leftProbe = probeSteps(-base.north, base.east, reachSteps);
  const rightProbe = probeSteps(base.north, -base.east, reachSteps);
  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      if (solid[idx]) {
        grid.flowE[idx] = 0;
        grid.flowN[idx] = 0;
        grid.speed[idx] = 0;
        continue;
      }
      const ge = gradE[idx]!;
      const gn = gradN[idx]!;
      const gMag = Math.hypot(ge, gn);
      let dirE = base.east;
      let dirN = base.north;
      let factor = 1;
      if (gMag > 1e-4) {
        const ne = ge / gMag;
        const nn = gn / gMag;
        const into = base.east * ne + base.north * nn;
        const strength = Math.min(1, gMag * GROUND_WIND_DEFLECT_GAIN);
        dirE -= ne * into * strength;
        dirN -= nn * into * strength;
        if (into > 0) factor *= 1 - GROUND_WIND_WINDWARD_SLOW * strength * into;
      }
      const dirMag = Math.hypot(dirE, dirN) || 1;
      const left = lateralClearM(obs, i, j, leftProbe);
      const right = lateralClearM(obs, i, j, rightProbe);
      const nearest = Math.min(left, right);
      const side = nearest < reachM ? GROUND_WIND_SIDE_BOOST * (1 - nearest / reachM) : 0;
      const channel =
        left < channelM && right < channelM ? GROUND_WIND_CHANNEL_BOOST * (1 - (left + right) / (2 * channelM)) : 0;
      factor *= (1 + Math.max(side, channel, corner[idx]!)) * shelter[idx]!;
      factor = Math.max(GROUND_WIND_SPEED_MIN, factor);
      grid.flowE[idx] = (dirE / dirMag) * factor;
      grid.flowN[idx] = (dirN / dirMag) * factor;
      grid.speed[idx] = factor;
    }
  }
}

export function createGroundWindGridBuilder(cache: GroundWindFieldCache, sectorIn: number | undefined): GroundWindGridBuilder {
  const sector = groundWindSector(sectorIn);
  const base = downwindFromSector(sector);
  let result = cache.grids.get(sector) ?? null;
  let grid: GroundWindFlowGrid | null = null;
  let prep: GroundWindPrep | null = null;
  let row = 0;

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const work = (): boolean => {
    if (!cache.obstacles) {
      cache.obstacles = rasterGroundWindObstacles(cache.model);
      return false;
    }
    const obs = cache.obstacles;
    if (!grid) {
      const n = obs.cols * obs.rows;
      grid = { sector, base, obstacles: obs, flowE: new Float32Array(n), flowN: new Float32Array(n), speed: new Float32Array(n) };
      prep = { shelter: shelterField(obs, base), corner: cornerField(obs, base) };
      return false;
    }
    const next = Math.min(obs.rows, row + GROUND_WIND_ROWS_PER_SLICE);
    flowRows(obs, base, prep!, grid, row, next);
    row = next;
    if (row < obs.rows) return false;
    cache.grids.set(sector, grid);
    cache.builds += 1;
    result = grid;
    return true;
  };

  return {
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

export function buildGroundWindGrid(model: CityModel, sector: number | undefined): GroundWindFlowGrid {
  return createGroundWindGridBuilder(groundWindFieldCache(model), sector).finish();
}

export function groundWindCellIndex(obs: GroundWindObstacles, east: number, north: number): number {
  const i = Math.floor((east - obs.originE) / obs.cellM);
  const j = Math.floor((north - obs.originN) / obs.cellM);
  if (i < 0 || j < 0 || i >= obs.cols || j >= obs.rows) return -1;
  return j * obs.cols + i;
}

export function groundWindIsSolid(obs: GroundWindObstacles, east: number, north: number): boolean {
  const idx = groundWindCellIndex(obs, east, north);
  return idx >= 0 && obs.solid[idx] === 1;
}

export function sampleGroundWindFlow(grid: GroundWindFlowGrid, east: number, north: number, out: GroundWindFlowSample): GroundWindFlowSample {
  const { cols, rows, cellM, originE, originN } = grid.obstacles;
  const x = Math.min(cols - 1, Math.max(0, (east - originE) / cellM - 0.5));
  const y = Math.min(rows - 1, Math.max(0, (north - originN) / cellM - 0.5));
  const i0 = x | 0;
  const j0 = y | 0;
  const i1 = i0 + 1 < cols ? i0 + 1 : i0;
  const j1 = j0 + 1 < rows ? j0 + 1 : j0;
  const tx = x - i0;
  const ty = y - j0;
  const a = j0 * cols + i0;
  const b = j0 * cols + i1;
  const c = j1 * cols + i0;
  const d = j1 * cols + i1;
  const wa = (1 - tx) * (1 - ty);
  const wb = tx * (1 - ty);
  const wc = (1 - tx) * ty;
  const wd = tx * ty;
  const { flowE, flowN, speed } = grid;
  out.east = flowE[a]! * wa + flowE[b]! * wb + flowE[c]! * wc + flowE[d]! * wd;
  out.north = flowN[a]! * wa + flowN[b]! * wb + flowN[c]! * wc + flowN[d]! * wd;
  out.speed = speed[a]! * wa + speed[b]! * wb + speed[c]! * wc + speed[d]! * wd;
  return out;
}

export function groundWindHeightAt(model: CityModel, east: number, north: number): number {
  const y = model.terrain ? sampleTerrain(model.terrain, east, north, model.sideM) : 0;
  return y + Math.max(0.6, model.sideM * 0.0012);
}
