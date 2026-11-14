import type { GroundWindParticles } from "./groundWindParticles";

export const GROUND_WIND_SCREEN_TARGET_1440 = 1800;
export const GROUND_WIND_REFERENCE_VIEW_W = 1440;
export const GROUND_WIND_REFERENCE_VIEW_H = 900;
export const GROUND_WIND_STREAMLINE_CELL_PX = 14;
export const GROUND_WIND_GROUND_Y_MIN = 70;
export const GROUND_WIND_GROUND_Y_MAX = 800;
export const GROUND_WIND_FAR_Y_MIN = 70;
export const GROUND_WIND_FAR_Y_MAX = 300;
export const GROUND_WIND_FAR_X_MAX = 820;
export const GROUND_WIND_NEAR_Y_MIN = 330;
export const GROUND_WIND_NEAR_Y_MAX = 560;

export function groundWindGridCellCount(viewW: number, viewH: number, cellPx = GROUND_WIND_STREAMLINE_CELL_PX): number {
  const cols = Math.max(1, Math.ceil(viewW / cellPx));
  const rows = Math.max(1, Math.ceil(viewH / cellPx));
  return cols * rows;
}

export function groundWindTargetParticleCount(viewW: number, viewH: number): number {
  const bandRows = Math.max(1, Math.ceil((GROUND_WIND_GROUND_Y_MAX - GROUND_WIND_GROUND_Y_MIN) / GROUND_WIND_STREAMLINE_CELL_PX));
  const bandCells = Math.ceil(viewW / GROUND_WIND_STREAMLINE_CELL_PX) * bandRows;
  const refBandRows = Math.ceil((GROUND_WIND_GROUND_Y_MAX - GROUND_WIND_GROUND_Y_MIN) / GROUND_WIND_STREAMLINE_CELL_PX);
  const refBandCells = Math.ceil(GROUND_WIND_REFERENCE_VIEW_W / GROUND_WIND_STREAMLINE_CELL_PX) * refBandRows;
  const refArea = GROUND_WIND_REFERENCE_VIEW_W * GROUND_WIND_REFERENCE_VIEW_H;
  const areaScale = Math.sqrt(Math.max(0.5, (viewW * Math.max(1, viewH)) / refArea));
  const target = Math.round(bandCells * (GROUND_WIND_SCREEN_TARGET_1440 / refBandCells) * areaScale);
  return Math.max(1200, Math.min(3200, target));
}

export function groundWindFarNearBandBalance(
  screenX: Float32Array,
  screenY: Float32Array,
  count: number,
  viewW: number,
): { far: number; near: number; ratio: number } {
  let far = 0;
  let near = 0;
  const farArea = Math.max(1, GROUND_WIND_FAR_X_MAX * (GROUND_WIND_FAR_Y_MAX - GROUND_WIND_FAR_Y_MIN));
  const nearArea = Math.max(1, viewW * (GROUND_WIND_NEAR_Y_MAX - GROUND_WIND_NEAR_Y_MIN));
  for (let i = 0; i < count; i++) {
    const sx = screenX[i]!;
    const sy = screenY[i]!;
    if (sx < GROUND_WIND_FAR_X_MAX && sy >= GROUND_WIND_FAR_Y_MIN && sy <= GROUND_WIND_FAR_Y_MAX) far++;
    if (sy >= GROUND_WIND_NEAR_Y_MIN && sy <= GROUND_WIND_NEAR_Y_MAX) near++;
  }
  const farDensity = far / farArea;
  const nearDensity = near / nearArea;
  const ratio = nearDensity > 0 ? farDensity / nearDensity : 0;
  return { far: farDensity, near: nearDensity, ratio };
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
