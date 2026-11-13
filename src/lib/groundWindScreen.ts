import type { GroundWindParticles } from "./groundWindParticles";

export const GROUND_WIND_SCREEN_TARGET_1440 = 1800;
export const GROUND_WIND_REFERENCE_VIEW_W = 1440;
export const GROUND_WIND_REFERENCE_VIEW_H = 900;

export function groundWindTargetParticleCount(viewW: number, viewH: number): number {
  const scale = (viewW * viewH) / (GROUND_WIND_REFERENCE_VIEW_W * GROUND_WIND_REFERENCE_VIEW_H);
  return Math.round(GROUND_WIND_SCREEN_TARGET_1440 * scale);
}

export function groundWindScreenHalfCounts(screenX: Float32Array, count: number, viewW: number): { west: number; east: number } {
  let west = 0;
  let east = 0;
  const mid = viewW * 0.5;
  for (let i = 0; i < count; i++) {
    if (screenX[i]! < mid) west++;
    else east++;
  }
  return { west, east };
}

export function groundWindEstimatedBlueCoverage(
  particleCount: number,
  meanTrailLenPx: number,
  meanWidthPx: number,
  viewW: number,
  viewH: number,
): number {
  if (viewW <= 0 || viewH <= 0) return 0;
  return (particleCount * meanTrailLenPx * meanWidthPx * 0.62) / (viewW * viewH);
}

export function groundWindActiveOnScreen(
  particles: GroundWindParticles,
  east: number,
  north: number,
  y: number,
): boolean {
  const project = particles.screenProject;
  if (!project) return true;
  const screen = project(east, north, y);
  if (!screen) return false;
  const pad = 48;
  return (
    screen.x >= -pad &&
    screen.x <= particles.viewWidth + pad &&
    screen.y >= -pad &&
    screen.y <= particles.viewHeight + pad
  );
}
