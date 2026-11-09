export type WindLbmGridSpec = {
  nx: number;
  ny: number;
  sideM: number;
};

export type WindLbmInflow = {
  ux: number;
  uy: number;
  speedLu: number;
};

export type WindLbmSolverState = {
  spec: WindLbmGridSpec;
  obstacle: Uint8Array;
  f: Float32Array;
  rho: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  omega: number;
  inflow: WindLbmInflow;
};

export type WindLbmBackend = "gpu" | "cpu";

export type WindLbmFlowSettings = {
  playing: boolean;
  directionDeg: number | null;
  speedScale: number;
  showHeatmap: boolean;
  showRose: boolean;
};

export const DEFAULT_WIND_LBM_FLOW: WindLbmFlowSettings = {
  playing: true,
  directionDeg: null,
  speedScale: 1,
  showHeatmap: false,
  showRose: true,
};
