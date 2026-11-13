import type { GroundWindParticles } from "./groundWindParticles";

export const GROUND_WIND_SCREEN_TARGET_1440 = 1800;
export const GROUND_WIND_REFERENCE_VIEW_W = 1440;
export const GROUND_WIND_REFERENCE_VIEW_H = 900;
export const GROUND_WIND_STREAMLINE_CELL_PX = 14;
export const GROUND_WIND_GROUND_Y_MIN = 70;
export const GROUND_WIND_GROUND_Y_MAX = 800;

export function groundWindGridCellCount(viewW: number, viewH: number, cellPx = GROUND_WIND_STREAMLINE_CELL_PX): number {
  const cols = Math.max(1, Math.ceil(viewW / cellPx));
  const rows = Math.max(1, Math.ceil(viewH / cellPx));
  return cols * rows;
}

export function groundWindTargetParticleCount(viewW: number, viewH: number): number {
  const cells = groundWindGridCellCount(viewW, viewH);
  const refCells = groundWindGridCellCount(GROUND_WIND_REFERENCE_VIEW_W, GROUND_WIND_REFERENCE_VIEW_H);
  const target = Math.round(cells * (GROUND_WIND_SCREEN_TARGET_1440 / refCells));
  return Math.max(900, Math.min(3200, target));
}

export function groundWindEstimatedBlueCoverage(
  particleCount: number,
  meanTrailLenPx: number,
  meanWidthPx: number,
  viewW: number,
  viewH: number,
): number {
  if (viewW <= 0 || viewH <= 0) return 0;
  return (particleCount * meanTrailLenPx * meanWidthPx * 0.48) / (viewW * viewH);
}

export function groundWindGroundNormalizedBalance(
  screenX: Float32Array,
  screenY: Float32Array,
  count: number,
  viewW: number,
  yMin = GROUND_WIND_GROUND_Y_MIN,
  yMax = GROUND_WIND_GROUND_Y_MAX,
): { west: number; east: number; ratio: number } {
  let west = 0;
  let east = 0;
  const midX = viewW * 0.5;
  const groundSpan = Math.max(1, yMax - yMin);
  const westArea = midX * groundSpan;
  const eastArea = (viewW - midX) * groundSpan;
  for (let i = 0; i < count; i++) {
    const sy = screenY[i]!;
    if (sy < yMin || sy > yMax) continue;
    const sx = screenX[i]!;
    if (sx < midX) west++;
    else east++;
  }
  const westDensity = west / westArea;
  const eastDensity = east / eastArea;
  const ratio = eastDensity > 0 ? westDensity / eastDensity : 0;
  return { west: westDensity, east: eastDensity, ratio };
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
  const pad = 32;
  return (
    screen.x >= -pad &&
    screen.x <= particles.viewWidth + pad &&
    screen.y >= -pad &&
    screen.y <= particles.viewHeight + pad
  );
}
