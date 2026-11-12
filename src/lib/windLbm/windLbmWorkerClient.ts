import { createLbmState, lbmCpuStep } from "./lbmCpu";
import type { WindLbmInflow } from "./types";
import type { WindLbmSolverState } from "./types";

export function windLbmWorkerAvailable(): boolean {
  return typeof Worker !== "undefined";
}

export function runWindLbmCpuSteps(state: WindLbmSolverState, steps: number, scratch: Float32Array): void {
  for (let s = 0; s < steps; s++) lbmCpuStep(state, scratch);
}

export function cloneLbmState(state: WindLbmSolverState): WindLbmSolverState {
  const next = createLbmState(state.spec, state.obstacle.slice() as Uint8Array, state.inflow, state.omega);
  next.f.set(state.f);
  next.ux.set(state.ux);
  next.uy.set(state.uy);
  next.rho.set(state.rho);
  return next;
}

export function inflowKey(inflow: WindLbmInflow): string {
  return `${inflow.ux},${inflow.uy},${inflow.speedLu}`;
}
