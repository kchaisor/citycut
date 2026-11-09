import { LBM_Q, LBM_W, LBM_CX, LBM_CY } from "./lbmConstants";
import type { WindLbmSolverState } from "./types";

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

function prescribeVelocity(f: Float32Array, cell: number, ux: number, uy: number): void {
  for (let k = 0; k < LBM_Q; k++) f[cell * LBM_Q + k] = feq(k, 1, ux, uy);
}

function copyOutlet(f: Float32Array, dst: number, src: number): void {
  for (let k = 0; k < LBM_Q; k++) f[dst * LBM_Q + k] = f[src * LBM_Q + k]!;
}

export function applyInletOutlet(state: WindLbmSolverState): void {
  const { spec, obstacle, f, inflow } = state;
  const { nx, ny } = spec;
  const ux = inflow.ux;
  const uy = inflow.uy;
  const uMag = Math.hypot(ux, uy) || 1;
  const inletThr = uMag * 0.25;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cell = idx(i, j, nx);
      if (obstacle[cell]) continue;
      const onWest = i === 0;
      const onEast = i === nx - 1;
      const onSouth = j === 0;
      const onNorth = j === ny - 1;
      const inletWest = onWest && ux > inletThr;
      const inletEast = onEast && ux < -inletThr;
      const inletSouth = onSouth && uy > inletThr;
      const inletNorth = onNorth && uy < -inletThr;
      if (inletWest || inletEast || inletSouth || inletNorth) {
        prescribeVelocity(f, cell, ux, uy);
        state.rho[cell] = 1;
        state.ux[cell] = ux;
        state.uy[cell] = uy;
        continue;
      }
      const outletWest = onWest && ux < -inletThr;
      const outletEast = onEast && ux > inletThr;
      const outletSouth = onSouth && uy < -inletThr;
      const outletNorth = onNorth && uy > inletThr;
      if (outletWest && nx > 1) copyOutlet(f, cell, idx(1, j, nx));
      else if (outletEast && nx > 1) copyOutlet(f, cell, idx(nx - 2, j, nx));
      else if (outletSouth && ny > 1) copyOutlet(f, cell, idx(i, 1, nx));
      else if (outletNorth && ny > 1) copyOutlet(f, cell, idx(i, ny - 2, nx));
      else if (onWest || onEast || onSouth || onNorth) {
        prescribeVelocity(f, cell, ux * 0.12, uy * 0.12);
      }
    }
  }
}
