import type { CityModel } from "../types";
import {
  sampleGroundWindFlow,
  type GroundWindFlowGrid,
  type GroundWindFlowSample,
} from "./groundWindField";

export const GROUND_WIND_TRAIL_POINTS = 10;
export const GROUND_WIND_TRAIL_SAMPLE_S = 0.07;
export const GROUND_WIND_VERTS_PER_STREAK = GROUND_WIND_TRAIL_POINTS * 2;
export const GROUND_WIND_INDICES_PER_STREAK = (GROUND_WIND_TRAIL_POINTS - 1) * 6;
export const GROUND_WIND_VERTEX_STRIDE = 8;
export const GROUND_WIND_STREAKS_DEFAULT = 2500;
export const GROUND_WIND_STREAKS_MIN = 400;
export const GROUND_WIND_STREAKS_AUTO_MAX = 3000;
export const GROUND_WIND_STREAKS_MAX = 8000;
export const GROUND_WIND_DEFAULT_AREA_M2 = 1000 * 1000;
export const GROUND_WIND_LIFE_MIN_S = 3;
export const GROUND_WIND_LIFE_MAX_S = 5;
export const GROUND_WIND_FADE_IN_S = 0.5;
export const GROUND_WIND_FADE_OUT_S = 0.7;
export const GROUND_WIND_TAIL_FADE = 0.5;
export const GROUND_WIND_MAX_STEP_S = 0.05;
export const GROUND_WIND_WARM_S = 1.2;

const HISTORY = GROUND_WIND_TRAIL_POINTS - 1;

export type HeightAt = (east: number, north: number) => number;

export type GroundWindStreaks = {
  count: number;
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  headE: Float32Array;
  headN: Float32Array;
  headY: Float32Array;
  headSpeed: Float32Array;
  dirE: Float32Array;
  dirN: Float32Array;
  histE: Float32Array;
  histN: Float32Array;
  histY: Float32Array;
  histSpeed: Float32Array;
  age: Float32Array;
  life: Float32Array;
  pace: Float32Array;
  stopped: Uint8Array;
  ring: number;
  sampleClock: number;
  seed: number;
  vertices: Float32Array;
  respawns: number;
  edgeRespawns: number;
};

export function groundWindStreakCount(
  model: Pick<CityModel, "sideM" | "widthM" | "heightM">,
  density = 1,
): number {
  const area = (model.widthM ?? model.sideM) * (model.heightM ?? model.sideM);
  const auto = Math.min(
    GROUND_WIND_STREAKS_AUTO_MAX,
    Math.max(GROUND_WIND_STREAKS_MIN, Math.round((GROUND_WIND_STREAKS_DEFAULT * area) / GROUND_WIND_DEFAULT_AREA_M2)),
  );
  return Math.min(GROUND_WIND_STREAKS_MAX, Math.max(GROUND_WIND_STREAKS_MIN, Math.round(auto * density)));
}

export function groundWindMetresPerSecond(sideM: number, medianKmh: number | undefined): number {
  const calmKmh = 8;
  const strongKmh = 32;
  const kmh = medianKmh && medianKmh > 0 ? medianKmh : 18;
  const t = Math.min(1, Math.max(0, (kmh - calmKmh) / (strongKmh - calmKmh)));
  const crossS = 14 - t * 5;
  return sideM / crossS;
}

export function groundWindLifeAlpha(age: number, life: number): number {
  if (age < 0 || age >= life) return 0;
  const fadeIn = Math.min(1, age / GROUND_WIND_FADE_IN_S);
  const fadeOut = Math.min(1, (life - age) / GROUND_WIND_FADE_OUT_S);
  return Math.min(fadeIn, fadeOut);
}

export function groundWindStreakIndices(count: number): Uint32Array {
  const out = new Uint32Array(count * GROUND_WIND_INDICES_PER_STREAK);
  let o = 0;
  for (let p = 0; p < count; p++) {
    const v = p * GROUND_WIND_VERTS_PER_STREAK;
    for (let k = 0; k < GROUND_WIND_TRAIL_POINTS - 1; k++) {
      const a = v + k * 2;
      out[o++] = a;
      out[o++] = a + 1;
      out[o++] = a + 2;
      out[o++] = a + 1;
      out[o++] = a + 3;
      out[o++] = a + 2;
    }
  }
  return out;
}

function nextRandom(streaks: GroundWindStreaks): number {
  let t = (streaks.seed = (streaks.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function rayEntry(streaks: GroundWindStreaks, e: number, n: number, de: number, dn: number): number {
  let t0 = 0;
  let t1 = Infinity;
  for (const [p, d, lo, hi] of [
    [e, de, streaks.minE, streaks.maxE],
    [n, dn, streaks.minN, streaks.maxN],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return -1;
      continue;
    }
    const a = (lo - p) / d;
    const b = (hi - p) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? t0 : -1;
}

function pickSpawn(streaks: GroundWindStreaks, grid: GroundWindFlowGrid, reachM: number, out: { e: number; n: number; edge: boolean }) {
  const { base, obstacles } = grid;
  const padW = base.east > 0 ? reachM * base.east : 0;
  const padE = base.east < 0 ? -reachM * base.east : 0;
  const padS = base.north > 0 ? reachM * base.north : 0;
  const padN = base.north < 0 ? -reachM * base.north : 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    let e = streaks.minE - padW + nextRandom(streaks) * (streaks.maxE - streaks.minE + padW + padE);
    let n = streaks.minN - padS + nextRandom(streaks) * (streaks.maxN - streaks.minN + padS + padN);
    let edge = false;
    if (e < streaks.minE || e > streaks.maxE || n < streaks.minN || n > streaks.maxN) {
      const t = rayEntry(streaks, e, n, base.east, base.north);
      if (t < 0) continue;
      e = Math.min(streaks.maxE, Math.max(streaks.minE, e + base.east * t));
      n = Math.min(streaks.maxN, Math.max(streaks.minN, n + base.north * t));
      edge = true;
    }
    const i = Math.min(obstacles.cols - 1, Math.floor((e - obstacles.originE) / obstacles.cellM));
    const j = Math.min(obstacles.rows - 1, Math.floor((n - obstacles.originN) / obstacles.cellM));
    if (obstacles.solid[j * obstacles.cols + i]) continue;
    out.e = e;
    out.n = n;
    out.edge = edge;
    return;
  }
  const cells = obstacles.fluidCells;
  const idx = cells.length ? cells[Math.floor(nextRandom(streaks) * cells.length)]! : 0;
  out.e = obstacles.originE + ((idx % obstacles.cols) + 0.5) * obstacles.cellM;
  out.n = obstacles.originN + (Math.floor(idx / obstacles.cols) + 0.5) * obstacles.cellM;
  out.edge = false;
}

const spawnScratch = { e: 0, n: 0, edge: false };
const flowScratch: GroundWindFlowSample = { east: 0, north: 0, speed: 0 };

function respawn(streaks: GroundWindStreaks, grid: GroundWindFlowGrid, heightAt: HeightAt, metresPerSecond: number, p: number, age: number) {
  const life = GROUND_WIND_LIFE_MIN_S + nextRandom(streaks) * (GROUND_WIND_LIFE_MAX_S - GROUND_WIND_LIFE_MIN_S);
  pickSpawn(streaks, grid, life * metresPerSecond, spawnScratch);
  const { e, n } = spawnScratch;
  const y = heightAt(e, n);
  const flow = sampleGroundWindFlow(grid, e, n, flowScratch);
  streaks.headE[p] = e;
  streaks.headN[p] = n;
  streaks.headY[p] = y;
  streaks.headSpeed[p] = flow.speed;
  streaks.dirE[p] = grid.base.east;
  streaks.dirN[p] = grid.base.north;
  streaks.age[p] = age;
  streaks.life[p] = life;
  streaks.pace[p] = 0.88 + nextRandom(streaks) * 0.24;
  streaks.stopped[p] = 0;
  for (let h = 0, o = p * HISTORY; h < HISTORY; h++, o++) {
    streaks.histE[o] = e;
    streaks.histN[o] = n;
    streaks.histY[o] = y;
    streaks.histSpeed[o] = flow.speed;
  }
  streaks.respawns += 1;
  if (spawnScratch.edge) streaks.edgeRespawns += 1;
}

export function createGroundWindStreaks(
  model: CityModel,
  grid: GroundWindFlowGrid,
  heightAt: HeightAt,
  metresPerSecond: number,
  count: number,
  vertices = new Float32Array(count * GROUND_WIND_VERTS_PER_STREAK * GROUND_WIND_VERTEX_STRIDE),
  seed = 7,
): GroundWindStreaks {
  const w = model.widthM ?? model.sideM;
  const h = model.heightM ?? model.sideM;
  const f = () => new Float32Array(count);
  const fh = () => new Float32Array(count * HISTORY);
  const streaks: GroundWindStreaks = {
    count,
    minE: -w / 2,
    maxE: w / 2,
    minN: -h / 2,
    maxN: h / 2,
    headE: f(),
    headN: f(),
    headY: f(),
    headSpeed: f(),
    dirE: f(),
    dirN: f(),
    histE: fh(),
    histN: fh(),
    histY: fh(),
    histSpeed: fh(),
    age: f(),
    life: f(),
    pace: f(),
    stopped: new Uint8Array(count),
    ring: 0,
    sampleClock: 0,
    seed: seed | 0,
    vertices,
    respawns: 0,
    edgeRespawns: 0,
  };
  for (let p = 0; p < count; p++) {
    respawn(streaks, grid, heightAt, metresPerSecond, p, 0);
    streaks.age[p] = -nextRandom(streaks) * streaks.life[p]!;
  }
  return streaks;
}

function advance(streaks: GroundWindStreaks, grid: GroundWindFlowGrid, heightAt: HeightAt, metresPerSecond: number, dt: number) {
  const { obstacles } = grid;
  const { cols, rows, cellM, originE, originN, solid } = obstacles;
  const { headE, headN, headY, headSpeed, dirE, dirN, age, life, pace, stopped } = streaks;
  const fadeOut = GROUND_WIND_FADE_OUT_S;
  for (let p = 0; p < streaks.count; p++) {
    const a = age[p]! + dt;
    age[p] = a;
    if (a >= life[p]!) {
      respawn(streaks, grid, heightAt, metresPerSecond, p, 0);
      continue;
    }
    if (a < 0 || stopped[p]) continue;
    const e = headE[p]!;
    const n = headN[p]!;
    const flow = sampleGroundWindFlow(grid, e, n, flowScratch);
    const k = metresPerSecond * pace[p]! * dt;
    const ne = e + flow.east * k;
    const nn = n + flow.north * k;
    const i = Math.floor((ne - originE) / cellM);
    const j = Math.floor((nn - originN) / cellM);
    if (ne < streaks.minE || ne > streaks.maxE || nn < streaks.minN || nn > streaks.maxN || i < 0 || j < 0 || i >= cols || j >= rows || solid[j * cols + i]) {
      stopped[p] = 1;
      if (a < life[p]! - fadeOut) age[p] = life[p]! - fadeOut;
      continue;
    }
    const mag = Math.hypot(flow.east, flow.north);
    if (mag > 1e-6) {
      dirE[p] = flow.east / mag;
      dirN[p] = flow.north / mag;
    }
    headE[p] = ne;
    headN[p] = nn;
    headY[p] = heightAt(ne, nn);
    headSpeed[p] = flow.speed;
  }
}

function recordHistory(streaks: GroundWindStreaks) {
  streaks.ring = (streaks.ring + HISTORY - 1) % HISTORY;
  const r = streaks.ring;
  const { headE, headN, headY, headSpeed, histE, histN, histY, histSpeed, age } = streaks;
  for (let p = 0; p < streaks.count; p++) {
    if (age[p]! < 0) continue;
    const o = p * HISTORY + r;
    histE[o] = headE[p]!;
    histN[o] = headN[p]!;
    histY[o] = headY[p]!;
    histSpeed[o] = headSpeed[p]!;
  }
}

export function stepGroundWindStreaks(
  streaks: GroundWindStreaks,
  grid: GroundWindFlowGrid,
  heightAt: HeightAt,
  metresPerSecond: number,
  dtIn: number,
) {
  let remaining = Math.max(0, dtIn);
  while (remaining > 0) {
    const dt = Math.min(GROUND_WIND_MAX_STEP_S, remaining);
    remaining -= dt;
    advance(streaks, grid, heightAt, metresPerSecond, dt);
    streaks.sampleClock += dt;
    while (streaks.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S) {
      streaks.sampleClock -= GROUND_WIND_TRAIL_SAMPLE_S;
      recordHistory(streaks);
    }
  }
}

export function warmGroundWindStreaks(
  streaks: GroundWindStreaks,
  grid: GroundWindFlowGrid,
  heightAt: HeightAt,
  metresPerSecond: number,
  seconds = GROUND_WIND_WARM_S,
) {
  const steps = Math.ceil(seconds / GROUND_WIND_MAX_STEP_S);
  for (let s = 0; s < steps; s++) stepGroundWindStreaks(streaks, grid, heightAt, metresPerSecond, seconds / steps);
}

const trailE = new Float32Array(GROUND_WIND_TRAIL_POINTS);
const trailN = new Float32Array(GROUND_WIND_TRAIL_POINTS);
const trailY = new Float32Array(GROUND_WIND_TRAIL_POINTS);
const trailS = new Float32Array(GROUND_WIND_TRAIL_POINTS);

function writeVertex(
  out: Float32Array,
  o: number,
  e: number,
  y: number,
  n: number,
  te: number,
  tn: number,
  side: number,
  speed: number,
  alpha: number,
) {
  out[o] = e;
  out[o + 1] = y;
  out[o + 2] = -n;
  out[o + 3] = te;
  out[o + 4] = -tn;
  out[o + 5] = side;
  out[o + 6] = speed;
  out[o + 7] = alpha;
}

export function writeGroundWindStreakVertices(streaks: GroundWindStreaks): number {
  const out = streaks.vertices;
  const last = GROUND_WIND_TRAIL_POINTS - 1;
  const phase = streaks.sampleClock / GROUND_WIND_TRAIL_SAMPLE_S;
  const stride = GROUND_WIND_VERTEX_STRIDE;
  const { headE, headN, headY, headSpeed, dirE, dirN, histE, histN, histY, histSpeed, age, life, ring } = streaks;
  let drawn = 0;
  for (let p = 0; p < streaks.count; p++) {
    const lifeAlpha = groundWindLifeAlpha(age[p]!, life[p]!);
    if (lifeAlpha <= 0) continue;
    trailE[0] = headE[p]!;
    trailN[0] = headN[p]!;
    trailY[0] = headY[p]!;
    trailS[0] = headSpeed[p]!;
    const base = p * HISTORY;
    for (let k = 1; k < last; k++) {
      const o = base + ((ring + k - 1) % HISTORY);
      trailE[k] = histE[o]!;
      trailN[k] = histN[o]!;
      trailY[k] = histY[o]!;
      trailS[k] = histSpeed[o]!;
    }
    const oldest = base + ((ring + HISTORY - 1) % HISTORY);
    const prev = base + ((ring + HISTORY - 2) % HISTORY);
    trailE[last] = histE[oldest]! + (histE[prev]! - histE[oldest]!) * phase;
    trailN[last] = histN[oldest]! + (histN[prev]! - histN[oldest]!) * phase;
    trailY[last] = histY[oldest]! + (histY[prev]! - histY[oldest]!) * phase;
    trailS[last] = histSpeed[oldest]!;
    const fe = dirE[p]!;
    const fn = dirN[p]!;
    let o = drawn * GROUND_WIND_VERTS_PER_STREAK * stride;
    for (let k = 0; k <= last; k++) {
      const ka = k === 0 ? 0 : k - 1;
      const kb = k === last ? last : k + 1;
      let te = trailE[ka]! - trailE[kb]!;
      let tn = trailN[ka]! - trailN[kb]!;
      const len = Math.hypot(te, tn);
      if (len > 1e-4) {
        te /= len;
        tn /= len;
      } else {
        te = fe;
        tn = fn;
      }
      const alpha = lifeAlpha * (1 - (k / last) * GROUND_WIND_TAIL_FADE);
      const e = trailE[k]!;
      const n = trailN[k]!;
      const y = trailY[k]!;
      const s = trailS[k]!;
      writeVertex(out, o, e, y, n, te, tn, -1, s, alpha);
      writeVertex(out, o + stride, e, y, n, te, tn, 1, s, alpha);
      o += stride * 2;
    }
    drawn += 1;
  }
  return drawn;
}
