import { createLbmState, lbmCpuStep } from "./lbmCpu";
import type { WindLbmGridSpec, WindLbmInflow } from "./types";

export type WindLbmWorkerRequest = {
  spec: WindLbmGridSpec;
  obstacle: Uint8Array;
  inflow: WindLbmInflow;
  steps: number;
  omega?: number;
};

export type WindLbmWorkerMessage =
  | { type: "field"; ux: Float32Array; uy: Float32Array; rho: Float32Array }
  | { type: "done"; ms: number };

type WorkerScope = {
  onmessage: ((event: MessageEvent<WindLbmWorkerRequest>) => void) | null;
  postMessage: (message: WindLbmWorkerMessage, transfer?: Transferable[]) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<WindLbmWorkerRequest>) => {
  const started = performance.now();
  const { spec, obstacle, inflow, steps, omega } = event.data;
  const state = createLbmState(spec, obstacle, inflow, omega);
  const scratch = new Float32Array(state.f.length);
  for (let s = 0; s < steps; s++) lbmCpuStep(state, scratch);
  scope.postMessage(
  {
    type: "field",
    ux: state.ux,
    uy: state.uy,
    rho: state.rho,
  } satisfies WindLbmWorkerMessage,
    [state.ux.buffer, state.uy.buffer, state.rho.buffer],
  );
  scope.postMessage({ type: "done", ms: performance.now() - started } satisfies WindLbmWorkerMessage);
};
