import type { WindLbmSolverState } from "./types";

export const WIND_PARTICLE_COUNT = 2800;
export const WIND_TRAIL_SAMPLES = 22;

export type WindFlowParticle = {
  east: number;
  north: number;
  seed: number;
  lastUx: number;
  lastUy: number;
  trailEast: Float32Array;
  trailNorth: Float32Array;
  trailHead: number;
};

function jitter(seed: number): number {
  return (Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

function initTrail(p: WindFlowParticle, east: number, north: number): void {
  p.trailHead = 0;
  p.trailEast.fill(east);
  p.trailNorth.fill(north);
}

export function spawnWindParticles(count: number, sideM: number, seedBase = 0): WindFlowParticle[] {
  const half = sideM / 2;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const out: WindFlowParticle[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const j0 = jitter(i + seedBase * 0.91);
    const j1 = jitter(i + seedBase * 1.73 + 0.5);
    const east = -half + ((col + 0.12 + j0 * 0.76) / cols) * sideM;
    const north = -half + ((row + 0.12 + j1 * 0.76) / rows) * sideM;
    const trailEast = new Float32Array(WIND_TRAIL_SAMPLES);
    const trailNorth = new Float32Array(WIND_TRAIL_SAMPLES);
    const p: WindFlowParticle = {
      east,
      north,
      seed: i + seedBase * 1.317,
      lastUx: 0.04,
      lastUy: 0,
      trailEast,
      trailNorth,
      trailHead: 0,
    };
    initTrail(p, east, north);
    out.push(p);
  }
  return out;
}

function pushTrail(p: WindFlowParticle, east: number, north: number): void {
  p.trailHead = (p.trailHead + 1) % WIND_TRAIL_SAMPLES;
  p.trailEast[p.trailHead] = east;
  p.trailNorth[p.trailHead] = north;
}

function sampleField(
  state: WindLbmSolverState,
  east: number,
  north: number,
): { ux: number; uy: number; blocked: boolean } {
  const { spec, obstacle, ux, uy } = state;
  const half = spec.sideM / 2;
  if (east < -half || east > half || north < -half || north > half) {
    return { ux: 0, uy: 0, blocked: true };
  }
  const fx = ((east + half) / spec.sideM) * spec.nx;
  const fy = ((north + half) / spec.sideM) * spec.ny;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  if (i0 < 0 || j0 < 0 || i0 >= spec.nx - 1 || j0 >= spec.ny - 1) {
    return { ux: 0, uy: 0, blocked: true };
  }
  const home = i0 + j0 * spec.nx;
  if (obstacle[home]) return { ux: 0, uy: 0, blocked: true };
  const tx = fx - i0;
  const ty = fy - j0;
  const mix = (i: number, j: number) => {
    const cell = i + j * spec.nx;
    if (obstacle[cell]) return { ux: 0, uy: 0, blocked: true };
    return { ux: ux[cell]!, uy: uy[cell]!, blocked: false };
  };
  const a = mix(i0, j0);
  const b = mix(i0 + 1, j0);
  const c = mix(i0, j0 + 1);
  const d = mix(i0 + 1, j0 + 1);
  if (a.blocked && b.blocked && c.blocked && d.blocked) return { ux: 0, uy: 0, blocked: true };
  let uxVal = a.ux * (1 - tx) * (1 - ty) + b.ux * tx * (1 - ty) + c.ux * (1 - tx) * ty + d.ux * tx * ty;
  let uyVal = a.uy * (1 - tx) * (1 - ty) + b.uy * tx * (1 - ty) + c.uy * (1 - tx) * ty + d.uy * tx * ty;
  const speed = Math.hypot(uxVal, uyVal);
  if (speed > 0.22) {
    const k = 0.22 / speed;
    uxVal *= k;
    uyVal *= k;
  }
  return { ux: uxVal, uy: uyVal, blocked: false };
}

function clampInside(east: number, north: number, half: number, margin: number): [number, number] {
  const lim = Math.max(0, half - margin);
  return [Math.min(lim, Math.max(-lim, east)), Math.min(lim, Math.max(-lim, north))];
}

function respawn(p: WindFlowParticle, sideM: number, state: WindLbmSolverState, attempt: number): void {
  const half = sideM / 2;
  const inlet = state.inflow;
  const uLen = Math.hypot(inlet.ux, inlet.uy) || 1;
  const je = jitter(p.seed + attempt * 1.9);
  const jn = jitter(p.seed + attempt * 2.7 + 0.2);
  let east = -half + je * sideM;
  let north = -half + jn * sideM;
  if (Math.abs(inlet.ux) >= Math.abs(inlet.uy)) {
    if (inlet.ux > 0) east = -half + je * sideM * 0.08;
    else east = half - je * sideM * 0.08;
    north = -half + jn * sideM;
  } else {
    if (inlet.uy > 0) north = -half + jn * sideM * 0.08;
    else north = half - jn * sideM * 0.08;
    east = -half + je * sideM;
  }
  const probe = sampleField(state, east, north);
  if (probe.blocked) {
    east = east * 0.7 + (inlet.ux / uLen) * half * 0.35;
    north = north * 0.7 + (inlet.uy / uLen) * half * 0.35;
  }
  const margin = sideM / state.spec.nx;
  const clamped = clampInside(east, north, half, margin);
  p.east = clamped[0];
  p.north = clamped[1];
  p.lastUx = inlet.ux;
  p.lastUy = inlet.uy;
  initTrail(p, p.east, p.north);
}

export function advectWindParticles(
  particles: WindFlowParticle[],
  state: WindLbmSolverState,
  dt: number,
  sideM: number,
): void {
  const half = sideM / 2;
  const cellM = sideM / state.spec.nx;
  const advectScale = cellM * 28;
  for (const p of particles) {
    const field = sampleField(state, p.east, p.north);
    if (field.blocked) {
      respawn(p, sideM, state, 1);
      continue;
    }
    const speed = Math.hypot(field.ux, field.uy);
    if (speed < 0.0008) {
      respawn(p, sideM, state, 2);
      continue;
    }
    p.lastUx = field.ux;
    p.lastUy = field.uy;
    const de = field.ux * advectScale * dt;
    const dn = field.uy * advectScale * dt;
    if (!Number.isFinite(de) || !Number.isFinite(dn)) {
      respawn(p, sideM, state, 4);
      continue;
    }
    const stepM = Math.hypot(de, dn);
    if (stepM > cellM * 2.8) {
      respawn(p, sideM, state, 5);
      continue;
    }
    p.east += de;
    p.north += dn;
    if (p.east < -half || p.east > half || p.north < -half || p.north > half) {
      respawn(p, sideM, state, 3);
      continue;
    }
    const margin = cellM * 0.35;
    const clamped = clampInside(p.east, p.north, half, margin);
    p.east = clamped[0];
    p.north = clamped[1];
    pushTrail(p, p.east, p.north);
  }
}

export function maxParticleTrailSegmentM(particles: readonly WindFlowParticle[], half: number): number {
  let max = 0;
  for (const p of particles) {
    let prevEast = p.east;
    let prevNorth = p.north;
    for (let t = 0; t < WIND_TRAIL_SAMPLES - 1; t++) {
      const idxA = (p.trailHead - t + WIND_TRAIL_SAMPLES) % WIND_TRAIL_SAMPLES;
      const idxB = (p.trailHead - t - 1 + WIND_TRAIL_SAMPLES) % WIND_TRAIL_SAMPLES;
      const eastA = p.trailEast[idxA]!;
      const northA = p.trailNorth[idxA]!;
      const eastB = p.trailEast[idxB]!;
      const northB = p.trailNorth[idxB]!;
      if (Math.abs(eastA) > half || Math.abs(northA) > half || Math.abs(eastB) > half || Math.abs(northB) > half) {
        continue;
      }
      const d = Math.hypot(eastA - eastB, northA - northB);
      if (d > max) max = d;
      prevEast = eastA;
      prevNorth = northA;
      void prevEast;
      void prevNorth;
    }
  }
  return max;
}

export function particleBinOccupancyFraction(particles: readonly WindFlowParticle[], sideM: number, bins = 10): number {
  const half = sideM / 2;
  const seen = new Set<number>();
  for (const p of particles) {
    if (Math.abs(p.east) > half || Math.abs(p.north) > half) continue;
    const bx = Math.min(bins - 1, Math.max(0, Math.floor(((p.east + half) / sideM) * bins)));
    const by = Math.min(bins - 1, Math.max(0, Math.floor(((p.north + half) / sideM) * bins)));
    seen.add(bx + by * bins);
  }
  return seen.size / (bins * bins);
}

export function particleFingerprint(particles: WindFlowParticle[]): string {
  if (particles.length === 0) return "";
  const a = particles[0]!;
  const b = particles[Math.floor(particles.length / 2)]!;
  return `${a.east.toFixed(3)},${a.north.toFixed(3)}|${b.east.toFixed(3)},${b.north.toFixed(3)}`;
}
