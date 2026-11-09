import { downwindEn, sectorCenterDeg } from "../windRose";
import { LBM_CX, LBM_CY, LBM_OPP, LBM_Q, LBM_W } from "./lbmConstants";
import type { WindLbmGridSpec, WindLbmInflow, WindLbmSolverState } from "./types";

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
  omega = omegaFromKinematicViscosity(0.02),
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

function setEquilibriumCell(f: Float32Array, cell: number, rho: number, ux: number, uy: number): void {
  for (let k = 0; k < LBM_Q; k++) f[cell * LBM_Q + k] = feq(k, rho, ux, uy);
}

function applyInletOutlet(state: WindLbmSolverState): void {
  const { spec, obstacle, f, inflow } = state;
  const { nx, ny } = spec;
  const interiorUx = inflow.ux;
  const interiorUy = inflow.uy;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cell = idx(i, j, nx);
      if (obstacle[cell]) continue;
      const onWest = i === 0;
      const onEast = i === nx - 1;
      const onSouth = j === 0;
      const onNorth = j === ny - 1;
      const inletWest = onWest && interiorUx > 0.002;
      const inletEast = onEast && interiorUx < -0.002;
      const inletSouth = onSouth && interiorUy > 0.002;
      const inletNorth = onNorth && interiorUy < -0.002;
      if (inletWest || inletEast || inletSouth || inletNorth) {
        setEquilibriumCell(f, cell, 1, interiorUx, interiorUy);
        continue;
      }
      const outletWest = onWest && interiorUx < -0.002;
      const outletEast = onEast && interiorUx > 0.002;
      const outletSouth = onSouth && interiorUy < -0.002;
      const outletNorth = onNorth && interiorUy > 0.002;
      if (outletWest && nx > 1) {
        const src = idx(1, j, nx);
        for (let k = 0; k < LBM_Q; k++) f[cell * LBM_Q + k] = f[src * LBM_Q + k]!;
      } else if (outletEast && nx > 1) {
        const src = idx(nx - 2, j, nx);
        for (let k = 0; k < LBM_Q; k++) f[cell * LBM_Q + k] = f[src * LBM_Q + k]!;
      } else if (outletSouth && ny > 1) {
        const src = idx(i, 1, nx);
        for (let k = 0; k < LBM_Q; k++) f[cell * LBM_Q + k] = f[src * LBM_Q + k]!;
      } else if (outletNorth && ny > 1) {
        const src = idx(i, ny - 2, nx);
        for (let k = 0; k < LBM_Q; k++) f[cell * LBM_Q + k] = f[src * LBM_Q + k]!;
      } else if (onWest || onEast || onSouth || onNorth) {
        setEquilibriumCell(f, cell, 1, interiorUx * 0.2, interiorUy * 0.2);
      }
    }
  }
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
  return Math.min(0.22, Math.max(0.04, (kmh / 100) * 0.14));
}
