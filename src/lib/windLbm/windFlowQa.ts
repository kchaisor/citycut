import type { WindLbmSolverState } from "./types";
import type { WindFlowParticle } from "./windParticles";

export function meanFlowVector(state: WindLbmSolverState | null): { ux: number; uy: number } {
  if (!state) return { ux: 0, uy: 0 };
  let sumUx = 0;
  let sumUy = 0;
  let n = 0;
  for (let i = 0; i < state.ux.length; i++) {
    if (state.obstacle[i]) continue;
    sumUx += state.ux[i]!;
    sumUy += state.uy[i]!;
    n++;
  }
  if (n === 0) return { ux: 0, uy: 0 };
  return { ux: sumUx / n, uy: sumUy / n };
}

export function particlesInsideCutRatio(particles: readonly WindFlowParticle[], half: number): number {
  if (particles.length === 0) return 0;
  let inside = 0;
  for (const p of particles) {
    if (Math.abs(p.east) <= half && Math.abs(p.north) <= half) inside++;
  }
  return inside / particles.length;
}

export function flowAlignmentScore(ux: number, uy: number, fromDeg: number): number {
  const rad = (fromDeg * Math.PI) / 180;
  const downEast = -Math.sin(rad);
  const downNorth = -Math.cos(rad);
  const speed = Math.hypot(ux, uy) || 1;
  const dot = (ux / speed) * downEast + (uy / speed) * downNorth;
  return dot;
}
