import { downwindEn, sectorCenterDeg } from "../windRose";
import { applyInletOutlet } from "./lbmBoundary";
import { LBM_CX, LBM_CY, LBM_OPP, LBM_Q, LBM_W } from "./lbmConstants";
import type { WindLbmGridSpec, WindLbmInflow, WindLbmSolverState } from "./types";

export { applyInletOutlet };

export const LBM_RELAXATION_TAU = 1.02;

export function defaultLbmOmega(): number {
  return 1 / LBM_RELAXATION_TAU;
}

function idx(i: number, j: number, nx: number): number {
  return i + j * nx;
}

function feq(k: number, rho: number, ux: number, uy: number): number {
  const cx = LBM_CX[k]!;
  const cy = LBM_CY[k]!;
  const cu = cx * ux + cy * uy;
  const u2 = ux * ux + uy * uy;
  return LBM_W[k]! * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * u2);
}

function macroAt(
  f: Float32Array,
  cell: number,
  out: { rho: number; ux: number; uy: number },
): void {
  let rho = 0;
  for (let k = 0; k < LBM_Q; k++) rho += f[cell * LBM_Q + k]!;
  if (rho < 1e-8) rho = 1;
  let ux = 0;
  let uy = 0;
  for (let k = 0; k < LBM_Q; k++) {
    ux += LBM_CX[k]! * f[cell * LBM_Q + k]!;
    uy += LBM_CY[k]! * f[cell * LBM_Q + k]!;
  }
  out.rho = rho;
  out.ux = ux / rho;
  out.uy = uy / rho;
}

export function inflowFromDirectionDeg(fromDeg: number, speedLu: number): WindLbmInflow {
  const down = downwindEn(fromDeg);
  const len = Math.hypot(down.east, down.north) || 1;
  const scale = speedLu / len;
  return { ux: down.east * scale, uy: down.north * scale, speedLu };
}

export function inflowFromSector(sector: number, speedLu: number): WindLbmInflow {
  return inflowFromDirectionDeg(sectorCenterDeg(sector), speedLu);
}

export function kinematicViscosityFromOmega(omega: number): number {
  return (1 / omega - 0.5) / 3;
}

export function omegaFromKinematicViscosity(nu: number): number {
  return 1 / (3 * nu + 0.5);
}

export function createLbmState(
  spec: WindLbmGridSpec,
  obstacle: Uint8Array,
  inflow: WindLbmInflow,
  omega = defaultLbmOmega(),
): WindLbmSolverState {
  const n = spec.nx * spec.ny;
  const f = new Float32Array(n * LBM_Q);
  const rho = new Float32Array(n);
  const ux = new Float32Array(n);
  const uy = new Float32Array(n);
  for (let j = 0; j < spec.ny; j++) {
    for (let i = 0; i < spec.nx; i++) {
      const cell = idx(i, j, spec.nx);
      if (obstacle[cell]) {
        for (let k = 0; k < LBM_Q; k++) f[cell * LBM_Q + k] = 0;
        rho[cell] = 1;
        ux[cell] = 0;
        uy[cell] = 0;
      } else {
        for (let k = 0; k < LBM_Q; k++) {
          f[cell * LBM_Q + k] = feq(k, 1, inflow.ux, inflow.uy);
        }
        rho[cell] = 1;
        ux[cell] = inflow.ux;
        uy[cell] = inflow.uy;
      }
    }
  }
  return { spec, obstacle, f, rho, ux, uy, omega, inflow };
}

export function meanFluidSpeed(state: WindLbmSolverState): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < state.ux.length; i++) {
    if (state.obstacle[i]) continue;
    sum += Math.hypot(state.ux[i]!, state.uy[i]!);
    n++;
  }
  return n > 0 ? sum / n : 0;
}

export function lbmWarmUpSettle(
  state: WindLbmSolverState,
  options?: { maxBundles?: number; bundleSteps?: number; relTol?: number; scratch?: Float32Array },
): { totalSteps: number; meanSpeed: number } {
  const maxBundles = options?.maxBundles ?? 18;
  const bundleSteps = options?.bundleSteps ?? 100;
  const relTol = options?.relTol ?? 0.01;
  const scratch = options?.scratch;
  let prev = meanFluidSpeed(state);
  let total = 0;
  for (let b = 0; b < maxBundles; b++) {
    lbmStepMany(state, bundleSteps, scratch);
    total += bundleSteps;
    const cur = meanFluidSpeed(state);
    if (b > 2 && Math.abs(cur - prev) / Math.max(prev, 1e-6) < relTol) break;
    prev = cur;
  }
  return { totalSteps: total, meanSpeed: meanFluidSpeed(state) };
}

export function lbmCpuStep(state: WindLbmSolverState, scratch?: Float32Array): void {
  const { spec, obstacle, f, rho, ux, uy, omega, inflow } = state;
  const { nx, ny } = spec;
  const n = nx * ny;
  const next = scratch && scratch.length === n * LBM_Q ? scratch : new Float32Array(n * LBM_Q);
  const macro = { rho: 1, ux: 0, uy: 0 };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cell = idx(i, j, nx);
      if (obstacle[cell]) {
        for (let k = 0; k < LBM_Q; k++) next[cell * LBM_Q + k] = 0;
        rho[cell] = 1;
        ux[cell] = 0;
        uy[cell] = 0;
        continue;
      }
      for (let k = 0; k < LBM_Q; k++) {
        const cx = LBM_CX[k]!;
        const cy = LBM_CY[k]!;
        const pi = i - cx;
        const pj = j - cy;
        let srcCell: number;
        if (pi < 0 || pi >= nx || pj < 0 || pj >= ny) {
          srcCell = cell;
        } else {
          srcCell = idx(pi, pj, nx);
        }
        if (obstacle[srcCell]) {
          next[cell * LBM_Q + k] = f[cell * LBM_Q + LBM_OPP[k]!]!;
        } else {
          next[cell * LBM_Q + k] = f[srcCell * LBM_Q + k]!;
        }
      }
      macroAt(next, cell, macro);
      for (let k = 0; k < LBM_Q; k++) {
        const eq = feq(k, macro.rho, macro.ux, macro.uy);
        next[cell * LBM_Q + k] = next[cell * LBM_Q + k]! + omega * (eq - next[cell * LBM_Q + k]!);
      }
      rho[cell] = macro.rho;
      ux[cell] = macro.ux;
      uy[cell] = macro.uy;
    }
  }
  state.f.set(next);
  applyInletOutlet(state);
  void inflow;
}

export function resetLbmInflow(state: WindLbmSolverState, inflow: WindLbmInflow): WindLbmSolverState {
  return createLbmState(state.spec, state.obstacle, inflow, state.omega);
}

export function lbmTotalMass(state: WindLbmSolverState): number {
  let sum = 0;
  for (let i = 0; i < state.rho.length; i++) {
    if (!state.obstacle[i]) sum += state.rho[i]!;
  }
  return sum;
}

export function lbmMaxFluidSpeed(state: WindLbmSolverState): number {
  let max = 0;
  for (let i = 0; i < state.ux.length; i++) {
    if (state.obstacle[i]) continue;
    max = Math.max(max, Math.hypot(state.ux[i]!, state.uy[i]!));
  }
  return max;
}

export function lbmStepMany(state: WindLbmSolverState, steps: number, scratch?: Float32Array): void {
  for (let s = 0; s < steps; s++) lbmCpuStep(state, scratch);
}

export function speedLuFromKmh(kmh: number): number {
  const bias = 0.09 + (Math.min(40, Math.max(8, kmh)) / 40) * 0.01;
  return Math.min(0.1, Math.max(0.09, bias));
}
