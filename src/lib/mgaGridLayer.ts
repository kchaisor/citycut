import { MGA_GRID_MIN_GAP_PX, MGA_GRID_STEPS_M, type GridCross } from "./mgaGrid";

/**
 * Landing-map MGA crosses, drawn by a MapLibre custom WebGL layer. Every frame the layer draws
 * from cached cross positions with the map's own matrix, so the crosses stay locked to their
 * ground positions and never drop out: there is no GeoJSON setData, no tile reload and no symbol
 * placement or fade. Each cross belongs to the coarsest step it sits on (its rank); a rank's
 * opacity ramps smoothly with its on-screen spacing, so a finer level fades in while the coarser
 * crosses stay fully drawn, and no zoom is ever left without crosses.
 */
export const MGA_GRID_LAYER_ID = "citycut-mga-grid-crosses";
export const MGA_GRID_FADE_START_PX = 28;
export const MGA_GRID_FADE_FULL_PX = MGA_GRID_MIN_GAP_PX;
export const MGA_GRID_MAX_CROSSES = 16000;

const EARTH_CIRCUMFERENCE_M = 40075016.686;

export function metresPerPixel(zoom: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

export function levelOpacity(step: number, metresPerPx: number): number {
  const gap = step / metresPerPx;
  const t = (gap - MGA_GRID_FADE_START_PX) / (MGA_GRID_FADE_FULL_PX - MGA_GRID_FADE_START_PX);
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export function finestVisibleStep(metresPerPx: number): number {
  for (const step of MGA_GRID_STEPS_M) if (step / metresPerPx > MGA_GRID_FADE_START_PX) return step;
  return MGA_GRID_STEPS_M[MGA_GRID_STEPS_M.length - 1]!;
}

export function crossRank(easting: number, northing: number, finest: number): number {
  let rank = finest;
  for (const step of MGA_GRID_STEPS_M) {
    if (step < finest) continue;
    if (easting % step === 0 && northing % step === 0) rank = step;
  }
  return rank;
}

export type Bounds = { west: number; south: number; east: number; north: number };
export type GridCache = Bounds & { step: number; ranks: Map<number, number[]> };

export function cacheBounds(view: Bounds): Bounds {
  const w = (view.east - view.west) / 2;
  const h = (view.north - view.south) / 2;
  return { west: view.west - w, east: view.east + w, south: view.south - h, north: view.north + h };
}

export function cacheCovers(cache: GridCache | null, view: Bounds, step: number): boolean {
  return (
    !!cache &&
    cache.step === step &&
    view.west >= cache.west &&
    view.east <= cache.east &&
    view.south >= cache.south &&
    view.north <= cache.north
  );
}

export function gridReferenceLat(lat: number): number {
  return Math.round(lat * 2) / 2;
}

export function pageGridCrosses(region: Bounds, step: number, maxCount = MGA_GRID_MAX_CROSSES): GridCross[] {
  const refLat = gridReferenceLat((region.south + region.north) / 2);
  const metresPerUnit = EARTH_CIRCUMFERENCE_M * Math.cos((refLat * Math.PI) / 180);
  const [x0, y0] = lonLatToMercator(region.west, region.north);
  const [x1, y1] = lonLatToMercator(region.east, region.south);
  const i0 = Math.floor((x0 * metresPerUnit) / step);
  const i1 = Math.ceil((x1 * metresPerUnit) / step);
  const j0 = Math.floor(((1 - y1) * metresPerUnit) / step);
  const j1 = Math.ceil(((1 - y0) * metresPerUnit) / step);
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > maxCount) return [];
  const out: GridCross[] = [];
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const [lon, lat] = mercatorToLonLat((i * step) / metresPerUnit, 1 - (j * step) / metresPerUnit);
      out.push({ lon, lat, easting: i * step, northing: j * step });
    }
  return out;
}

export function buildCache(view: Bounds, step: number): GridCache {
  const region = cacheBounds(view);
  const ranks = new Map<number, number[]>();
  for (const cross of pageGridCrosses(region, step)) {
    const rank = crossRank(cross.easting, cross.northing, step);
    let list = ranks.get(rank);
    if (!list) ranks.set(rank, (list = []));
    list.push(cross.lon, cross.lat);
  }
  return { ...region, step, ranks };
}

export function crossVertices(
  centres: ArrayLike<number>,
  arm: number,
  halfWidth = 0.5,
): { centres: Float32Array; offsets: Float32Array; count: number } {
  const n = centres.length / 2;
  const quad = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1];
  const shape = [...quad(-arm, -halfWidth, arm, halfWidth), ...quad(-halfWidth, -arm, halfWidth, -halfWidth), ...quad(-halfWidth, halfWidth, halfWidth, arm)];
  const per = shape.length / 2;
  const outCentres = new Float32Array(n * per * 2);
  const outOffsets = new Float32Array(n * per * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < per; k++) {
      const j = (i * per + k) * 2;
      outCentres[j] = centres[i * 2]!;
      outCentres[j + 1] = centres[i * 2 + 1]!;
      outOffsets[j] = shape[k * 2]!;
      outOffsets[j + 1] = shape[k * 2 + 1]!;
    }
  }
  return { centres: outCentres, offsets: outOffsets, count: n * per };
}

export function lonLatToMercator(lon: number, lat: number): [number, number] {
  const sin = Math.sin((lat * Math.PI) / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)];
}

export function mercatorToLonLat(x: number, y: number): [number, number] {
  const lon = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [lon, lat];
}

export function translateMatrix(matrix: ArrayLike<number>, ox: number, oy: number): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 16; i++) out[i] = matrix[i]!;
  for (let r = 0; r < 4; r++) out[12 + r] = matrix[r]! * ox + matrix[4 + r]! * oy + matrix[12 + r]!;
  return out;
}
