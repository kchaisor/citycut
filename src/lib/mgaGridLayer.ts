import { MGA_GRID_MIN_GAP_PX, MGA_GRID_STEPS_M, mgaGridCrosses } from "./mgaGrid";

/**
 * Landing-map MGA crosses, drawn by a MapLibre custom WebGL layer. Every frame the layer draws
 * from cached cross positions with the map's own matrix, so the crosses stay locked to their
 * ground positions and never drop out: there is no GeoJSON setData, no tile reload and no symbol
 * placement or fade. Each cross belongs to the coarsest step it sits on (its rank); a rank's
 * opacity ramps smoothly with its on-screen spacing, so a finer level fades in while the coarser
 * crosses stay fully drawn, and no zoom is ever left without crosses.
 */
export const MGA_GRID_LAYER_ID = "citycut-mga-grid-crosses";
/** On-screen spacing (CSS px) where a level starts to fade in, and where it is fully drawn. */
export const MGA_GRID_FADE_START_PX = 28;
export const MGA_GRID_FADE_FULL_PX = MGA_GRID_MIN_GAP_PX;
/** Largest number of cached crosses; the cache covers the view plus half a view on each side. */
export const MGA_GRID_MAX_CROSSES = 16000;

const EARTH_CIRCUMFERENCE_M = 40075016.686;

export function metresPerPixel(zoom: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Opacity of one level from its on-screen spacing: 0 below the start, 1 at full, smooth between. */
export function levelOpacity(step: number, metresPerPx: number): number {
  const gap = step / metresPerPx;
  const t = (gap - MGA_GRID_FADE_START_PX) / (MGA_GRID_FADE_FULL_PX - MGA_GRID_FADE_START_PX);
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Finest step that is at least starting to show at this scale (the cache's grid step). */
export function finestVisibleStep(metresPerPx: number): number {
  for (const step of MGA_GRID_STEPS_M) if (step / metresPerPx > MGA_GRID_FADE_START_PX) return step;
  return MGA_GRID_STEPS_M[MGA_GRID_STEPS_M.length - 1]!;
}

/** Coarsest ladder step that divides both coordinates (a 1 km cross is also a 500 m one). */
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

/** Cache region: the view plus half a view on each side. */
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

/** Crosses for a region grouped by rank, as lon/lat pairs. */
export function buildCache(view: Bounds, step: number): GridCache {
  const region = cacheBounds(view);
  const ranks = new Map<number, number[]>();
  for (const cross of mgaGridCrosses(region, step, undefined, MGA_GRID_MAX_CROSSES)) {
    const rank = crossRank(cross.easting, cross.northing, step);
    let list = ranks.get(rank);
    if (!list) ranks.set(rank, (list = []));
    list.push(cross.lon, cross.lat);
  }
  return { ...region, step, ranks };
}

/** Two thin quads per cross (horizontal and vertical arm), as triangles: centre + pixel offset. */
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

/** Web Mercator in MapLibre's 0..1 world units. */
export function lonLatToMercator(lon: number, lat: number): [number, number] {
  const sin = Math.sin((lat * Math.PI) / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)];
}

/** `matrix × translate(ox, oy)`, in float64, so float32 vertices can stay relative to an origin. */
export function translateMatrix(matrix: ArrayLike<number>, ox: number, oy: number): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 16; i++) out[i] = matrix[i]!;
  for (let r = 0; r < 4; r++) out[12 + r] = matrix[r]! * ox + matrix[4 + r]! * oy + matrix[12 + r]!;
  return out;
}
