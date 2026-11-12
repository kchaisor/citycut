import {
  groundWindCellIndex,
  groundWindSpeedAt,
  groundWindVelocityAt,
  type GroundWindField,
  type WindVector,
} from "./groundWindField";

export const GROUND_WIND_TRAIL_POINTS = 28;
export const GROUND_WIND_POINTS_PER_PARTICLE = GROUND_WIND_TRAIL_POINTS + 1;
export const GROUND_WIND_POINT_STRIDE = 5;
export const GROUND_WIND_TRAIL_SAMPLE_S = 1 / 40;
export const GROUND_WIND_PARTICLES_MIN = 520;
export const GROUND_WIND_PARTICLES_MAX = 1650;
export const GROUND_WIND_AREA_PER_PARTICLE_M2 = 380;
export const GROUND_WIND_LIFE_MIN_S = 3.4;
export const GROUND_WIND_LIFE_MAX_S = 9;
export const GROUND_WIND_FADE_IN_S = 0.45;
export const GROUND_WIND_FADE_OUT_S = 1.35;
export const GROUND_WIND_WOBBLE = 0.11;
export const GROUND_WIND_TRAIL_LEN_MIN = 6;
export const GROUND_WIND_TRAIL_LEN_MAX = GROUND_WIND_TRAIL_POINTS - 1;

export type HeightAt = (east: number, north: number) => number;

export type GroundWindParticles = {
  count: number;
  east: Float32Array;
  north: Float32Array;
  age: Float32Array;
  life: Float32Array;
  seed: Float32Array;
  speed: Float32Array;
  history: Float32Array;
  head: Int32Array;
  points: Float32Array;
  sampleClock: number;
  rng: () => number;
};

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(i: number, j: number, salt: number): number {
  let t = (i * 374761393 + j * 668265263 + salt * 1442695041) >>> 0;
  t = Math.imul(t ^ (t >>> 13), t | 1);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

export function groundWindParticleCount(field: GroundWindField): number {
  const areaM2 = field.fluidCells.length * field.cellM * field.cellM;
  return Math.round(Math.min(GROUND_WIND_PARTICLES_MAX, Math.max(GROUND_WIND_PARTICLES_MIN, areaM2 / GROUND_WIND_AREA_PER_PARTICLE_M2)));
}

function alongProfile(k: number, maxK: number): number {
  return maxK > 0 ? k / maxK : 0;
}

export function groundWindPointsLength(count: number): number {
  return count * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE;
}

function upwindExtent(field: GroundWindField): { minE: number; maxE: number; minN: number; maxN: number } {
  const spanE = field.cols * field.cellM;
  const spanN = field.rows * field.cellM;
  const bx = field.base.east;
  const by = field.base.north;
  const margin = field.cellM * 0.35;
  if (Math.abs(bx) >= Math.abs(by)) {
    return bx >= 0
      ? { minE: field.originE - margin, maxE: field.originE + spanE * 0.42, minN: field.originN, maxN: field.originN + spanN }
      : { minE: field.originE + spanE * 0.58, maxE: field.originE + spanE + margin, minN: field.originN, maxN: field.originN + spanN };
  }
  return by >= 0
    ? { minE: field.originE, maxE: field.originE + spanE, minN: field.originN - margin, maxN: field.originN + spanN * 0.42 }
    : { minE: field.originE, maxE: field.originE + spanE, minN: field.originN + spanN * 0.58, maxN: field.originN + spanN + margin };
}

function pickSpawnCell(field: GroundWindField, rng: () => number, index: number): number {
  const band = upwindExtent(field);
  for (let attempt = 0; attempt < 24; attempt++) {
    const useBand = attempt < 14;
    let east: number;
    let north: number;
    if (useBand) {
      const jx = hash2D(index, attempt, 91);
      const jy = hash2D(index, attempt, 127);
      east = band.minE + jx * (band.maxE - band.minE);
      north = band.minN + jy * (band.maxN - band.minN);
    } else {
      const cell = field.fluidCells[Math.floor(rng() * field.fluidCells.length)]!;
      const ci = cell % field.cols;
      const cj = Math.floor(cell / field.cols);
      const jx = hash2D(ci, cj, index + 17);
      const jy = hash2D(cj, ci, index + 41);
      east = field.originE + (ci + jx) * field.cellM;
      north = field.originN + (cj + jy) * field.cellM;
    }
  const idx = groundWindCellIndex(field, east, north);
    if (idx >= 0 && field.solid[idx] === 0) return idx;
  }
  return field.fluidCells[Math.floor(hash2D(index, 0, 3) * field.fluidCells.length)]!;
}

export function createGroundWindParticles(
  field: GroundWindField,
  heightAt: HeightAt,
  seed = 7,
  points?: Float32Array,
): GroundWindParticles {
  const count = groundWindParticleCount(field);
  const pointStore = points && points.length >= groundWindPointsLength(count) ? points : new Float32Array(groundWindPointsLength(count));
  const particles: GroundWindParticles = {
    count,
    east: new Float32Array(count),
    north: new Float32Array(count),
    age: new Float32Array(count),
    life: new Float32Array(count),
    seed: new Float32Array(count),
    speed: new Float32Array(count),
    history: new Float32Array(count * GROUND_WIND_TRAIL_POINTS * 3),
    head: new Int32Array(count),
    points: pointStore,
    sampleClock: 0,
    rng: seededRandom(seed),
  };
  for (let i = 0; i < count; i++) {
    spawnParticle(particles, field, heightAt, i);
    particles.age[i] = particles.rng() * particles.life[i]! * 0.95;
  }
  return particles;
}

export function spawnParticle(particles: GroundWindParticles, field: GroundWindField, heightAt: HeightAt, i: number) {
  const { rng } = particles;
  const cell = pickSpawnCell(field, rng, i);
  const ci = cell % field.cols;
  const cj = Math.floor(cell / field.cols);
  const jx = hash2D(ci, cj, i + 7);
  const jy = hash2D(cj, ci, i + 23);
  const east = field.originE + (ci + jx) * field.cellM;
  const north = field.originN + (cj + jy) * field.cellM;
  particles.east[i] = east;
  particles.north[i] = north;
  particles.age[i] = 0;
  particles.life[i] = GROUND_WIND_LIFE_MIN_S + rng() * (GROUND_WIND_LIFE_MAX_S - GROUND_WIND_LIFE_MIN_S);
  particles.seed[i] = rng() * Math.PI * 2;
  particles.speed[i] = groundWindSpeedAt(field, east, north);
  particles.head[i] = 0;
  const y = heightAt(east, north);
  const base = i * GROUND_WIND_TRAIL_POINTS * 3;
  for (let k = 0; k < GROUND_WIND_TRAIL_POINTS; k++) {
    particles.history[base + k * 3] = east;
    particles.history[base + k * 3 + 1] = north;
    particles.history[base + k * 3 + 2] = y;
  }
}

function pushHistory(particles: GroundWindParticles, i: number, east: number, north: number, y: number) {
  const head = (particles.head[i]! + 1) % GROUND_WIND_TRAIL_POINTS;
  particles.head[i] = head;
  const base = (i * GROUND_WIND_TRAIL_POINTS + head) * 3;
  particles.history[base] = east;
  particles.history[base + 1] = north;
  particles.history[base + 2] = y;
}

export function speedRamp(speed: number): number {
  const t = Math.min(1, Math.max(0, (speed - 0.04) / 1.05));
  return 0.22 + 0.78 * Math.pow(t, 0.55);
}

export function trailVisibleSegments(speed: number): number {
  const t = speedRamp(speed);
  return Math.round(GROUND_WIND_TRAIL_LEN_MIN + t * (GROUND_WIND_TRAIL_LEN_MAX - GROUND_WIND_TRAIL_LEN_MIN));
}

export function lifeEnvelope(age: number, life: number): number {
  const fadeIn = 1 - Math.exp(-age / GROUND_WIND_FADE_IN_S);
  const remain = Math.max(0, life - age);
  const fadeOut = 1 - Math.exp(-remain / GROUND_WIND_FADE_OUT_S);
  return Math.min(1, fadeIn * fadeOut);
}

export function groundWindSeedRowScore(east: Float32Array, north: Float32Array, count: number, cellM: number): number {
  const bins = 24;
  const bucket = new Float32Array(bins * bins);
  for (let i = 0; i < count; i++) {
    const bi = Math.min(bins - 1, Math.max(0, Math.floor(((east[i]! % (cellM * bins)) + cellM * bins) / (cellM * bins) * bins)));
    const bj = Math.min(bins - 1, Math.max(0, Math.floor(((north[i]! % (cellM * bins)) + cellM * bins) / (cellM * bins) * bins)));
    bucket[bj * bins + bi]! += 1;
  }
  let max = 0;
  let total = 0;
  let rowPeaks = 0;
  for (let j = 0; j < bins; j++) {
    let rowMax = 0;
    let rowSum = 0;
    for (let i = 0; i < bins; i++) {
      const v = bucket[j * bins + i]!;
      rowSum += v;
      if (v > rowMax) rowMax = v;
    }
    total += rowSum;
    if (rowSum > 0) rowPeaks += rowMax / rowSum;
    if (rowMax > max) max = rowMax;
  }
  if (total <= 0) return 0;
  const mean = total / (bins * bins);
  return mean > 0 ? (max / mean) * (rowPeaks / bins) : 0;
}

const scratch: WindVector = { east: 0, north: 0 };

export function stepGroundWindParticles(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  dt: number,
  metresPerSecond: number,
) {
  particles.sampleClock += dt;
  let pushes = 0;
  while (particles.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S && pushes < 4) {
    particles.sampleClock -= GROUND_WIND_TRAIL_SAMPLE_S;
    pushes++;
  }
  if (particles.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S) particles.sampleClock = 0;

  const baseMag = Math.hypot(field.base.east, field.base.north) || 1;

  for (let i = 0; i < particles.count; i++) {
    const e0 = particles.east[i]!;
    const n0 = particles.north[i]!;
    const v1 = groundWindVelocityAt(field, e0, n0, scratch);
    const halfStep = metresPerSecond * dt * 0.5;
    const midE = e0 + v1.east * halfStep;
    const midN = n0 + v1.north * halfStep;
    const v2 = groundWindVelocityAt(field, midE, midN, scratch);
    const speed = Math.hypot(v2.east, v2.north);
    const shelterT = Math.min(1, Math.max(0, 1 - speed / (baseMag * 1.1)));
    const wobble =
      Math.sin(particles.age[i]! * 2.7 + particles.seed[i]!) * GROUND_WIND_WOBBLE * (0.35 + shelterT * 1.9) * speed;
    const stepM = metresPerSecond * dt * (0.92 + speedRamp(speed) * 0.35);
    const east = e0 + (v2.east - v2.north * wobble) * stepM;
    const north = n0 + (v2.north + v2.east * wobble) * stepM;
    const age = particles.age[i]! + dt;
    const cell = groundWindCellIndex(field, east, north);
    if (cell < 0 || field.solid[cell] === 1 || age >= particles.life[i]!) {
      spawnParticle(particles, field, heightAt, i);
      continue;
    }
    particles.east[i] = east;
    particles.north[i] = north;
    particles.age[i] = age;
    particles.speed[i] = speed;
    if (pushes > 0) {
      const y = heightAt(east, north);
      for (let p = 0; p < pushes; p++) pushHistory(particles, i, east, north, y);
    }
  }
  writePoints(particles, heightAt, field);
}

function shelterAt(field: GroundWindField, east: number, north: number): number {
  const gx = (east - field.originE) / field.cellM - 0.5;
  const gy = (north - field.originN) / field.cellM - 0.5;
  const i = Math.min(field.cols - 1, Math.max(0, Math.floor(gx)));
  const j = Math.min(field.rows - 1, Math.max(0, Math.floor(gy)));
  return field.shelter[j * field.cols + i] ?? 1;
}

function writePoints(particles: GroundWindParticles, heightAt: HeightAt, field: GroundWindField) {
  const { points, history } = particles;
  for (let i = 0; i < particles.count; i++) {
    const speed = particles.speed[i]!;
    const env = lifeEnvelope(particles.age[i]!, particles.life[i]!);
    const ramp = speedRamp(speed) * env;
    const boost = speedRamp(speed / Math.max(0.5, Math.hypot(field.base.east, field.base.north)));
    const shel = shelterAt(field, particles.east[i]!, particles.north[i]!);
    const wakeDim = 0.55 + 0.45 * shel;
    const visible = trailVisibleSegments(speed);
    const head = particles.head[i]!;
    const particleBase = i * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE;
    const maxAlong = Math.max(1, visible - 1);
    const east = particles.east[i]!;
    const north = particles.north[i]!;
    const yHead = heightAt(east, north);
    for (let k = 0; k < GROUND_WIND_TRAIL_POINTS - 1; k++) {
      const out = particleBase + k * GROUND_WIND_POINT_STRIDE;
      if (k >= visible) {
        points[out] = east;
        points[out + 1] = yHead;
        points[out + 2] = -north;
        points[out + 3] = 0;
        points[out + 4] = 0;
        continue;
      }
      const slot = (head + GROUND_WIND_TRAIL_POINTS - visible + k + 1) % GROUND_WIND_TRAIL_POINTS;
      const h = (i * GROUND_WIND_TRAIL_POINTS + slot) * 3;
      points[out] = history[h]!;
      points[out + 1] = history[h + 2]!;
      points[out + 2] = -history[h + 1]!;
      const along = alongProfile(k, maxAlong);
      const tailFade = Math.pow(along, 0.85);
      points[out + 3] = ramp * boost * wakeDim * tailFade;
      points[out + 4] = along;
    }
    const live = particleBase + (GROUND_WIND_TRAIL_POINTS - 1) * GROUND_WIND_POINT_STRIDE;
    points[live] = east;
    points[live + 1] = yHead;
    points[live + 2] = -north;
    points[live + 3] = ramp * boost * wakeDim;
    points[live + 4] = 1;
    const pad = live + GROUND_WIND_POINT_STRIDE;
    points[pad] = east;
    points[pad + 1] = yHead;
    points[pad + 2] = -north;
    points[pad + 3] = 0;
    points[pad + 4] = 1;
  }
}

export function warmGroundWindParticles(
  particles: GroundWindParticles,
  field: GroundWindField,
  heightAt: HeightAt,
  metresPerSecond: number,
  seconds: number,
) {
  const steps = Math.max(1, Math.round(seconds / GROUND_WIND_TRAIL_SAMPLE_S));
  for (let s = 0; s < steps; s++) {
    stepGroundWindParticles(particles, field, heightAt, GROUND_WIND_TRAIL_SAMPLE_S, metresPerSecond);
  }
}

export function groundWindMetresPerSecond(sideM: number, medianKmh: number | undefined): number {
  const calmKmh = 8;
  const strongKmh = 32;
  const kmh = medianKmh && medianKmh > 0 ? medianKmh : 18;
  const t = Math.min(1, Math.max(0, (kmh - calmKmh) / (strongKmh - calmKmh)));
  const crossS = 14 - t * 5;
  return sideM / crossS;
}
