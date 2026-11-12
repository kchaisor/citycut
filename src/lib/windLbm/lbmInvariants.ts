import {
  createLbmState,
  inflowFromDirectionDeg,
  lbmMaxFluidSpeed,
  lbmStepMany,
  lbmTotalMass,
  speedLuFromKmh,
} from "./lbmCpu";
import { rasterizeBuildingObstacles, windLbmGridSpec } from "./obstacleRaster";
import type { BuildingFeat } from "../../types";
import type { WindLbmSolverState } from "./types";

export function halfBlockedObstacle(nx: number, ny: number): Uint8Array {
  const mask = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if ((i + j) % 2 === 0) mask[i + j * nx] = 1;
    }
  }
  return mask;
}

export function suburbanObstacleField(nx: number, ny: number): Uint8Array {
  const mask = new Uint8Array(nx * ny);
  const blocks: [number, number, number, number][] = [
    [Math.floor(nx * 0.2), Math.floor(ny * 0.25), 6, 8],
    [Math.floor(nx * 0.45), Math.floor(ny * 0.32), 8, 10],
    [Math.floor(nx * 0.62), Math.floor(ny * 0.55), 7, 9],
    [Math.floor(nx * 0.35), Math.floor(ny * 0.6), 5, 7],
    [Math.floor(nx * 0.72), Math.floor(ny * 0.22), 6, 8],
  ];
  for (const [x0, y0, w, h] of blocks) {
    for (let j = y0; j < Math.min(ny, y0 + h); j++) {
      for (let i = x0; i < Math.min(nx, x0 + w); i++) mask[i + j * nx] = 1;
    }
  }
  return mask;
}

export function singleBlockObstacle(nx: number, ny: number, blockW: number, blockH: number): Uint8Array {
  const mask = new Uint8Array(nx * ny);
  const x0 = Math.floor(nx * 0.5 - blockW / 2);
  const y0 = Math.floor(ny * 0.5 - blockH / 2);
  for (let j = y0; j < y0 + blockH; j++) {
    for (let i = x0; i < x0 + blockW; i++) {
      if (i >= 0 && i < nx && j >= 0 && j < ny) mask[i + j * nx] = 1;
    }
  }
  return mask;
}

export function obstacleVelocityMax(state: WindLbmSolverState): number {
  let max = 0;
  for (let i = 0; i < state.ux.length; i++) {
    if (!state.obstacle[i]) continue;
    max = Math.max(max, Math.hypot(state.ux[i]!, state.uy[i]!));
  }
  return max;
}

export function wakeDeflectionScore(state: WindLbmSolverState): number {
  const { nx, ny } = state.spec;
  const cx = Math.floor(nx / 2);
  const cy = Math.floor(ny / 2);
  let score = 0;
  for (let j = cy + 4; j < Math.min(ny - 2, cy + 20); j++) {
    for (let i = cx - 8; i <= cx + 8; i++) {
      const cell = i + j * nx;
      if (state.obstacle[cell]) continue;
      score = Math.max(score, Math.abs(state.uy[cell]!));
    }
  }
  return score;
}

export function settledWestFlowState(nx = 96, steps = 300): WindLbmSolverState {
  const spec = windLbmGridSpec(100, nx);
  const obstacle = singleBlockObstacle(spec.nx, spec.ny, 14, 22);
  const inflow = inflowFromDirectionDeg(270, speedLuFromKmh(18));
  const state = createLbmState(spec, obstacle, inflow);
  lbmStepMany(state, steps);
  return state;
}

export function massDriftRatio(state: WindLbmSolverState, steps: number): number {
  const start = lbmTotalMass(state);
  lbmStepMany(state, steps);
  const end = lbmTotalMass(state);
  const fluidCells = state.ux.length - obstacleCount(state);
  const scale = Math.max(1, fluidCells);
  return Math.abs(end - start) / scale;
}

function obstacleCount(state: WindLbmSolverState): number {
  let n = 0;
  for (let i = 0; i < state.obstacle.length; i++) if (state.obstacle[i]) n++;
  return n;
}

export function rasterBuildingCount(buildings: BuildingFeat[], sideM: number): number {
  const spec = windLbmGridSpec(sideM, 64);
  const mask = rasterizeBuildingObstacles(buildings, spec);
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  return n;
}

export function uniformFlowReferenceMass(nx = 64): number {
  const spec = windLbmGridSpec(80, nx);
  const inflow = inflowFromDirectionDeg(270, speedLuFromKmh(12));
  const state = createLbmState(spec, new Uint8Array(spec.nx * spec.ny), inflow);
  lbmStepMany(state, 80);
  return lbmTotalMass(state);
}

export function postObstacleSpeedDrop(state: WindLbmSolverState): number {
  const { nx, ny } = state.spec;
  const cx = Math.floor(nx / 2);
  const upstream = Math.max(0, cx - 18);
  const downstream = Math.min(nx - 1, cx + 18);
  let up = 0;
  let down = 0;
  let upN = 0;
  let downN = 0;
  const row = Math.floor(ny / 2);
  for (let j = row - 3; j <= row + 3; j++) {
    if (j < 0 || j >= ny) continue;
    const uCell = upstream + j * nx;
    const dCell = downstream + j * nx;
    if (!state.obstacle[uCell]) {
      up += Math.hypot(state.ux[uCell]!, state.uy[uCell]!);
      upN++;
    }
    if (!state.obstacle[dCell]) {
      down += Math.hypot(state.ux[dCell]!, state.uy[dCell]!);
      downN++;
    }
  }
  if (upN === 0 || downN === 0) return 0;
  return up / upN - down / downN;
}

export function lbmSaneSpeed(state: WindLbmSolverState): boolean {
  const max = lbmMaxFluidSpeed(state);
  return max > 0.01 && max < 0.35;
}
