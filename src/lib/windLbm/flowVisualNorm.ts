import type { WindLbmSolverState } from "./types";

export function fluidSpeedSamples(state: WindLbmSolverState): Float32Array {
  const speeds: number[] = [];
  for (let i = 0; i < state.ux.length; i++) {
    if (state.obstacle[i]) continue;
    const s = Math.hypot(state.ux[i]!, state.uy[i]!);
    if (Number.isFinite(s)) speeds.push(s);
  }
  speeds.sort((a, b) => a - b);
  return new Float32Array(speeds);
}

export function fluidSpeedPercentile(state: WindLbmSolverState, percentile = 0.95): number {
  const samples = fluidSpeedSamples(state);
  if (samples.length === 0) return state.inflow.speedLu;
  const idx = Math.min(samples.length - 1, Math.max(0, Math.floor(percentile * (samples.length - 1))));
  return samples[idx]!;
}

export function flowVisualNormSpeed(state: WindLbmSolverState): number {
  const inlet = state.inflow.speedLu;
  const p95 = fluidSpeedPercentile(state, 0.95);
  return Math.max(inlet * 0.85, p95, 0.06);
}

export function heatmapRampSpan(state: WindLbmSolverState, norm: number): number {
  let minT = 1;
  let maxT = 0;
  for (let i = 0; i < state.ux.length; i++) {
    if (state.obstacle[i]) continue;
    const t = Math.min(1, Math.hypot(state.ux[i]!, state.uy[i]!) / norm);
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
  }
  return maxT - minT;
}

export function cutFluidSpeedStats(state: WindLbmSolverState): {
  meanSpeed: number;
  p95Speed: number;
  inletSpeed: number;
  normSpeed: number;
  rampSpan: number;
} {
  const cutHalf = state.spec.cutSideM / 2;
  const domainHalf = state.spec.sideM / 2;
  const nx = state.spec.nx;
  const ny = state.spec.ny;
  const samples: number[] = [];
  for (let j = 0; j < ny; j++) {
    const north = -domainHalf + (j + 0.5) * (state.spec.sideM / ny);
    if (Math.abs(north) > cutHalf) continue;
    for (let i = 0; i < nx; i++) {
      const east = -domainHalf + (i + 0.5) * (state.spec.sideM / nx);
      if (Math.abs(east) > cutHalf) continue;
      const cell = i + j * nx;
      if (state.obstacle[cell]) continue;
      samples.push(Math.hypot(state.ux[cell]!, state.uy[cell]!));
    }
  }
  samples.sort((a, b) => a - b);
  const meanSpeed = samples.length > 0 ? samples.reduce((a, v) => a + v, 0) / samples.length : 0;
  const p95Speed =
    samples.length > 0 ? samples[Math.floor(0.95 * (samples.length - 1))]! : state.inflow.speedLu;
  const normSpeed = flowVisualNormSpeed(state);
  return {
    meanSpeed,
    p95Speed,
    inletSpeed: state.inflow.speedLu,
    normSpeed,
    rampSpan: heatmapRampSpan(state, normSpeed),
  };
}
