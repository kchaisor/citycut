import type { WindLbmSolverState } from "./types";

export type WindFlowParticle = {
  east: number;
  north: number;
  age: number;
  seed: number;
  lastUx: number;
  lastUy: number;
};

export function spawnWindParticles(count: number, sideM: number, seedBase = 0): WindFlowParticle[] {
  const half = sideM / 2;
  const out: WindFlowParticle[] = [];
  for (let i = 0; i < count; i++) {
    const t = i + seedBase * 1.317;
    const east = ((t * 73.21) % 1) * sideM - half;
    const north = ((t * 41.89) % 1) * sideM - half;
    out.push({ east, north, age: (t % 1) * 2.4, seed: t, lastUx: 0.04, lastUy: 0 });
  }
  return out;
}

function sampleField(
  state: WindLbmSolverState,
  east: number,
  north: number,
): { ux: number; uy: number; blocked: boolean } {
  const { spec, obstacle, ux, uy } = state;
  const half = spec.sideM / 2;
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

export function advectWindParticles(
  particles: WindFlowParticle[],
  state: WindLbmSolverState,
  dt: number,
  sideM: number,
): void {
  const half = sideM / 2;
  const worldScale = sideM * 0.42;
  for (const p of particles) {
    const field = sampleField(state, p.east, p.north);
    p.age += dt;
    if (field.blocked || p.age > 2.8) {
      p.east = ((p.seed * 19.3) % 1) * sideM - half;
      p.north = ((p.seed * 31.7) % 1) * sideM - half;
      p.age = 0;
      continue;
    }
    const speed = Math.hypot(field.ux, field.uy);
    if (speed < 0.002) {
      p.age = 3;
      continue;
    }
    p.lastUx = field.ux;
    p.lastUy = field.uy;
    p.east += field.ux * worldScale * dt;
    p.north += field.uy * worldScale * dt;
    if (p.east < -half || p.east > half || p.north < -half || p.north > half) {
      p.age = 3;
    }
  }
}

export function particleFingerprint(particles: WindFlowParticle[]): string {
  if (particles.length === 0) return "";
  const a = particles[0]!;
  const b = particles[Math.floor(particles.length / 2)]!;
  return `${a.east.toFixed(3)},${a.north.toFixed(3)}|${b.east.toFixed(3)},${b.north.toFixed(3)}`;
}
