import { groundWindCellIndex, groundWindVelocityAt, type GroundWindField, type WindVector } from "./groundWindField";

export const GROUND_WIND_TRAIL_POINTS = 16;
export const GROUND_WIND_POINTS_PER_PARTICLE = GROUND_WIND_TRAIL_POINTS + 1;
export const GROUND_WIND_POINT_STRIDE = 5;
export const GROUND_WIND_TRAIL_SAMPLE_S = 1 / 30;
export const GROUND_WIND_PARTICLES_MIN = 420;
export const GROUND_WIND_PARTICLES_MAX = 1800;
export const GROUND_WIND_AREA_PER_PARTICLE_M2 = 600;
export const GROUND_WIND_LIFE_MIN_S = 2.6;
export const GROUND_WIND_LIFE_MAX_S = 7.5;
export const GROUND_WIND_FADE_IN_S = 0.6;
export const GROUND_WIND_FADE_OUT_S = 1.1;
export const GROUND_WIND_WOBBLE = 0.07;

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

export function groundWindParticleCount(field: GroundWindField): number {
  const areaM2 = field.fluidCells.length * field.cellM * field.cellM;
  return Math.round(Math.min(GROUND_WIND_PARTICLES_MAX, Math.max(GROUND_WIND_PARTICLES_MIN, areaM2 / GROUND_WIND_AREA_PER_PARTICLE_M2)));
}

function alongProfile(k: number): number {
  return k / (GROUND_WIND_TRAIL_POINTS - 1);
}

export function groundWindPointsLength(count: number): number {
  return count * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE;
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
    particles.age[i] = particles.rng() * particles.life[i]!;
  }
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < GROUND_WIND_POINTS_PER_PARTICLE; k++) {
      const base = (i * GROUND_WIND_POINTS_PER_PARTICLE + k) * GROUND_WIND_POINT_STRIDE;
      particles.points[base + 4] = k >= GROUND_WIND_TRAIL_POINTS - 1 ? 1 : alongProfile(k);
    }
  }
  return particles;
}

export function spawnParticle(particles: GroundWindParticles, field: GroundWindField, heightAt: HeightAt, i: number) {
  const { rng } = particles;
  const cell = field.fluidCells[Math.min(field.fluidCells.length - 1, Math.floor(rng() * field.fluidCells.length))]!;
  const ci = cell % field.cols;
  const cj = Math.floor(cell / field.cols);
  const east = field.originE + (ci + rng()) * field.cellM;
  const north = field.originN + (cj + rng()) * field.cellM;
  particles.east[i] = east;
  particles.north[i] = north;
  particles.age[i] = 0;
  particles.life[i] = GROUND_WIND_LIFE_MIN_S + rng() * (GROUND_WIND_LIFE_MAX_S - GROUND_WIND_LIFE_MIN_S);
  particles.seed[i] = rng() * Math.PI * 2;
  particles.speed[i] = 0;
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
  const t = Math.min(1, Math.max(0, (speed - 0.05) / 1.1));
  return 0.14 + 0.86 * Math.pow(t, 0.8);
}

export function lifeEnvelope(age: number, life: number): number {
  const fadeIn = Math.min(1, age / GROUND_WIND_FADE_IN_S);
  const fadeOut = Math.min(1, Math.max(0, (life - age) / GROUND_WIND_FADE_OUT_S));
  return fadeIn * fadeOut;
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
  while (particles.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S && pushes < 3) {
    particles.sampleClock -= GROUND_WIND_TRAIL_SAMPLE_S;
    pushes++;
  }
  if (particles.sampleClock >= GROUND_WIND_TRAIL_SAMPLE_S) particles.sampleClock = 0;

  for (let i = 0; i < particles.count; i++) {
    const e0 = particles.east[i]!;
    const n0 = particles.north[i]!;
    const v1 = groundWindVelocityAt(field, e0, n0, scratch);
    const halfStep = metresPerSecond * dt * 0.5;
    const midE = e0 + v1.east * halfStep;
    const midN = n0 + v1.north * halfStep;
    const v2 = groundWindVelocityAt(field, midE, midN, scratch);
    const speed = Math.hypot(v2.east, v2.north);
    const wobble = Math.sin(particles.age[i]! * 2.4 + particles.seed[i]!) * GROUND_WIND_WOBBLE * speed;
    const stepM = metresPerSecond * dt;
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
  writePoints(particles, heightAt);
}

function writePoints(particles: GroundWindParticles, heightAt: HeightAt) {
  const { points, history } = particles;
  for (let i = 0; i < particles.count; i++) {
    const ramp = speedRamp(particles.speed[i]!) * lifeEnvelope(particles.age[i]!, particles.life[i]!);
    const head = particles.head[i]!;
    const particleBase = i * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE;
    for (let k = 0; k < GROUND_WIND_TRAIL_POINTS - 1; k++) {
      const slot = (head + 2 + k) % GROUND_WIND_TRAIL_POINTS;
      const h = (i * GROUND_WIND_TRAIL_POINTS + slot) * 3;
      const out = particleBase + k * GROUND_WIND_POINT_STRIDE;
      points[out] = history[h]!;
      points[out + 1] = history[h + 2]!;
      points[out + 2] = -history[h + 1]!;
      points[out + 3] = ramp * Math.pow(alongProfile(k), 1.4);
    }
    const east = particles.east[i]!;
    const north = particles.north[i]!;
    const y = heightAt(east, north);
    const live = particleBase + (GROUND_WIND_TRAIL_POINTS - 1) * GROUND_WIND_POINT_STRIDE;
    points[live] = east;
    points[live + 1] = y;
    points[live + 2] = -north;
    points[live + 3] = ramp;
    const pad = live + GROUND_WIND_POINT_STRIDE;
    points[pad] = east;
    points[pad + 1] = y;
    points[pad + 2] = -north;
    points[pad + 3] = 0;
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
  const crossS = 24 - t * 10;
  return sideM / crossS;
}
