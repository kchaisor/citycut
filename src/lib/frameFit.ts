const EARTH_M = 40075016.686;
const TILE_PX = 512;

export const FRAME_FIT_MARGIN_PX = 24;

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

export function frameSidePx(sideM: number, lat: number, zoom: number): number {
  const metresPerPx = (EARTH_M * Math.cos((lat * Math.PI) / 180)) / (TILE_PX * 2 ** zoom);
  return sideM / metresPerPx;
}

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
