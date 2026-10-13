import { MGA_GRID_MIN_GAP_PX, MGA_GRID_STEPS_M, mgaGridCrosses } from "./mgaGrid";

/**
 * Landing-map MGA crosses as a native MapLibre symbol layer. The crosses are GeoJSON points
 * drawn by the map's own renderer in the same frame as the tiles, so they stay locked to their
 * ground positions while panning and zooming (no DOM/canvas redraw a frame behind, no pixel
 * rounding). Each cross carries the coarsest grid step it belongs to (its rank); its opacity is
 * a zoom expression that fades it in as that step becomes readable, so spacing changes fade
 * instead of popping.
 */
export const MGA_GRID_SOURCE_ID = "citycut-mga-grid";
export const MGA_GRID_LAYER_ID = "citycut-mga-grid-crosses";
export const MGA_GRID_ICON_ID = "citycut-mga-cross";
/** Zoom levels over which a newly readable level fades in. */
export const MGA_GRID_FADE_ZOOM = 0.4;

const EARTH_CIRCUMFERENCE_M = 40075016.686;

export function metresPerPixel(zoom: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Zoom at which `step` reaches the minimum readable gap at latitude `lat`. */
export function zoomForStep(step: number, lat: number, minGapPx = MGA_GRID_MIN_GAP_PX): number {
  return Math.log2((EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180) * minGapPx) / (512 * step));
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

/** `icon-opacity`: per-rank fade from 0 at the zoom its step becomes readable to 1 a little later. */
export function crossOpacityExpression(lat: number, fade = MGA_GRID_FADE_ZOOM): unknown[] {
  const starts = MGA_GRID_STEPS_M.map((step) => ({ step, z0: zoomForStep(step, lat) }));
  const coarsest = MGA_GRID_STEPS_M[MGA_GRID_STEPS_M.length - 1]!;
  const value = (step: number, z0: number, z: number) =>
    step === coarsest ? 1 : Math.min(1, Math.max(0, (z - z0) / fade));
  const stops = [...new Set(starts.flatMap(({ z0 }) => [z0, z0 + fade]))].sort((a, b) => a - b);
  const expression: unknown[] = ["interpolate", ["linear"], ["zoom"]];
  for (const z of stops) {
    const match: unknown[] = ["match", ["get", "rank"]];
    for (const { step, z0 } of starts) match.push(step, Number(value(step, z0, z).toFixed(4)));
    match.push(1);
    expression.push(z, match);
  }
  return expression;
}

export type GridRegion = { west: number; south: number; east: number; north: number; step: number };

/** Crosses for the current step over a region a viewport wider on every side. */
export function crossRegion(bounds: { west: number; south: number; east: number; north: number }, step: number): GridRegion {
  const w = bounds.east - bounds.west;
  const h = bounds.north - bounds.south;
  return { west: bounds.west - w, east: bounds.east + w, south: bounds.south - h, north: bounds.north + h, step };
}

export function regionCovers(region: GridRegion | null, bounds: { west: number; south: number; east: number; north: number }, step: number): boolean {
  return (
    !!region &&
    region.step === step &&
    bounds.west >= region.west &&
    bounds.east <= region.east &&
    bounds.south >= region.south &&
    bounds.north <= region.north
  );
}

export function crossFeatures(region: GridRegion): GeoJSON.FeatureCollection<GeoJSON.Point, { rank: number }> {
  return {
    type: "FeatureCollection",
    features: mgaGridCrosses(region, region.step).map((cross) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cross.lon, cross.lat] },
      properties: { rank: crossRank(cross.easting, cross.northing, region.step) },
    })),
  };
}

/** A thin 1 px dark + on a transparent square, `arm` px each way, at the device pixel ratio. */
export function crossImage(arm: number, rgba: [number, number, number, number], pixelRatio: number): { width: number; height: number; data: Uint8Array } {
  const ratio = Math.max(1, Math.round(pixelRatio));
  const size = (2 * arm + 1) * ratio;
  const data = new Uint8Array(size * size * 4);
  const centre = arm * ratio;
  const put = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  };
  for (let t = 0; t < size; t++) {
    for (let k = 0; k < ratio; k++) {
      put(t, centre + k);
      put(centre + k, t);
    }
  }
  return { width: size, height: size, data };
}
