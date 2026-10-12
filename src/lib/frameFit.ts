/** Earth circumference at the equator in metres (Web Mercator). */
const EARTH_M = 40075016.686;
/** MapLibre lays the world out on 512 px tiles. */
const TILE_PX = 512;

/** Default gap kept between the cut frame and the map edge, in CSS pixels. */
export const FRAME_FIT_MARGIN_PX = 24;

/**
 * Largest zoom at which a cut of `sideM` (square side or circle diameter) fits a
 * `widthPx` x `heightPx` map with `marginPx` clear on every side.
 */
export function zoomToFitFrame(
  sideM: number,
  lat: number,
  widthPx: number,
  heightPx: number,
  marginPx = FRAME_FIT_MARGIN_PX,
): number {
  const available = Math.max(1, Math.min(widthPx, heightPx) - 2 * marginPx);
  const metresPerPxAtZoom0 = (EARTH_M * Math.cos((lat * Math.PI) / 180)) / TILE_PX;
  return Math.log2((metresPerPxAtZoom0 * available) / sideM);
}

/** Frame side in pixels at `zoom`, the inverse of `zoomToFitFrame`. */
export function frameSidePx(sideM: number, lat: number, zoom: number): number {
  const metresPerPx = (EARTH_M * Math.cos((lat * Math.PI) / 180)) / (TILE_PX * 2 ** zoom);
  return sideM / metresPerPx;
}

/**
 * Initial zoom for the landing map. On a phone, zoom out (never in) so the whole frame
 * fits. On desktop the requested zoom is kept exactly.
 */
export function initialLandingZoom(opts: {
  zoom: number;
  sideM: number;
  lat: number;
  widthPx: number;
  heightPx: number;
  fit: boolean;
}): number {
  if (!opts.fit || opts.widthPx <= 0 || opts.heightPx <= 0) return opts.zoom;
  return Math.min(opts.zoom, zoomToFitFrame(opts.sideM, opts.lat, opts.widthPx, opts.heightPx));
}
