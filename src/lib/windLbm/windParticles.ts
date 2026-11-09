import type { WindLbmSolverState } from "./types";

export const WIND_PARTICLE_COUNT = 2800;
export const WIND_TRAIL_SAMPLES = 28;

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

export function spawnWindParticles(count: number, sideM: number, seedBase = 0): WindFlowParticle[] {
  const half = sideM / 2;
  const out: WindFlowParticle[] = [];
  for (let i = 0; i < count; i++) {
    const t = i + seedBase * 1.317;
    const east = ((t * 73.21) % 1) * sideM - half;
    const north = ((t * 41.89) % 1) * sideM - half;
    const trailEast = new Float32Array(WIND_TRAIL_SAMPLES);
    const trailNorth = new Float32Array(WIND_TRAIL_SAMPLES);
    trailEast[0] = east;
    trailNorth[0] = north;
    out.push({
      east,
      north,
      seed: t,
      lastUx: 0.04,
      lastUy: 0,
      trailEast,
      trailNorth,
      trailHead: 0,
    });
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
  const uxVal = a.ux * (1 - tx) * (1 - ty) + b.ux * tx * (1 - ty) + c.ux * (1 - tx) * ty + d.ux * tx * ty;
  const uyVal = a.uy * (1 - tx) * (1 - ty) + b.uy * tx * (1 - ty) + c.uy * (1 - tx) * ty + d.uy * tx * ty;
  return { ux: uxVal, uy: uyVal, blocked: false };
}

function respawn(p: WindFlowParticle, sideM: number, state: WindLbmSolverState, attempt: number): void {
  const half = sideM / 2;
  const inlet = state.inflow;
  const uLen = Math.hypot(inlet.ux, inlet.uy) || 1;
  const east = ((p.seed * 19.3 + attempt * 0.71) % 1) * sideM - half;
  const north = ((p.seed * 31.7 + attempt * 0.53) % 1) * sideM - half;
  const upwind =
    (inlet.ux > 0 && east < -half * 0.3) ||
    (inlet.ux < 0 && east > half * 0.3) ||
    (inlet.uy > 0 && north < -half * 0.3) ||
    (inlet.uy < 0 && north > half * 0.3);
  p.east = upwind ? east : east * 0.6 + (inlet.ux / uLen) * half * 0.15;
  p.north = upwind ? north : north * 0.6 + (inlet.uy / uLen) * half * 0.15;
  p.lastUx = inlet.ux;
  p.lastUy = inlet.uy;
  p.trailHead = 0;
  p.trailEast.fill(p.east);
  p.trailNorth.fill(p.north);
}

export function advectWindParticles(
  particles: WindFlowParticle[],
  state: WindLbmSolverState,
  dt: number,
  sideM: number,
): void {
  const half = sideM / 2;
  const advectScale = sideM * 0.55;
  for (const p of particles) {
    const field = sampleField(state, p.east, p.north);
    if (field.blocked) {
      respawn(p, sideM, state, 1);
      continue;
    }
    const speed = Math.hypot(field.ux, field.uy);
    if (speed < 0.0015) {
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
    p.east += de;
    p.north += dn;
    if (p.east < -half || p.east > half || p.north < -half || p.north > half) {
      respawn(p, sideM, state, 3);
      continue;
    }
    pushTrail(p, p.east, p.north);
  }
}

export function particleFingerprint(particles: WindFlowParticle[]): string {
  if (particles.length === 0) return "";
  const a = particles[0]!;
  const b = particles[Math.floor(particles.length / 2)]!;
  return `${a.east.toFixed(3)},${a.north.toFixed(3)}|${b.east.toFixed(3)},${b.north.toFixed(3)}`;
}
