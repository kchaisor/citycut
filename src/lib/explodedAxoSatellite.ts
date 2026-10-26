import { squareBBox } from "./geo";
import type { CityModel } from "../types";

const TILE = 256;

/** Web Mercator pixel coords for standard 256 px raster tiles (Esri, OSM). */
function webMercatorPixel256(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const world = TILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * world;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * world;
  return { x, y };
}
const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/** Same zoom as the in-app Satellite preview (`SatellitePane`). */
const SATELLITE_ZOOMS = [15, 14, 13, 12] as const;

function tileUrl(z: number, x: number, y: number): string {
  return SATELLITE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

function canvasLooksLikePlaceholder(ctx: CanvasRenderingContext2D, sizePx: number): boolean {
  const w = Math.min(72, sizePx);
  const h = Math.min(72, sizePx);
  const x0 = Math.floor((sizePx - w) / 2);
  const y0 = Math.floor((sizePx - h) / 2);
  const sample = ctx.getImageData(x0, y0, w, h).data;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < sample.length; i += 4) {
    const lum = sample[i]! * 0.299 + sample[i + 1]! * 0.587 + sample[i + 2]! * 0.114;
    sum += lum;
    sumSq += lum * lum;
    n++;
  }
  if (n === 0) return true;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return variance < 90 && mean > 165 && mean < 235;
}

async function stitchAtZoom(
  model: CityModel,
  sizePx: number,
  zoom: number,
  fetchImpl: typeof fetch,
): Promise<Uint8Array | null> {
  const bounds = squareBBox(model.center, model.sideM);
  const nw = webMercatorPixel256(bounds.west, bounds.north, zoom);
  const se = webMercatorPixel256(bounds.east, bounds.south, zoom);
  const x0 = Math.floor(nw.x / TILE);
  const x1 = Math.floor(se.x / TILE);
  const y0 = Math.floor(nw.y / TILE);
  const y1 = Math.floor(se.y / TILE);

  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const pxWest = nw.x;
  const pxNorth = nw.y;
  const pxEast = se.x;
  const pxSouth = se.y;
  const spanX = pxEast - pxWest;
  const spanY = pxSouth - pxNorth;
  if (spanX <= 0 || spanY <= 0) return null;

  try {
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const response = await fetchImpl(tileUrl(zoom, tx, ty));
        if (!response.ok) return null;
        const contentLength = Number(response.headers.get("content-length") ?? "0");
        if (contentLength > 0 && contentLength < 4000) return null;
        const blob = await response.blob();
        if (blob.size < 4000) return null;
        const bitmap = await createImageBitmap(blob);
        const tilePxX = tx * TILE - pxWest;
        const tilePxY = ty * TILE - pxNorth;
        const destX = (tilePxX / spanX) * sizePx;
        const destY = (tilePxY / spanY) * sizePx;
        const destW = (TILE / spanX) * sizePx;
        const destH = (TILE / spanY) * sizePx;
        ctx.drawImage(bitmap, destX, destY, destW, destH);
        bitmap.close();
      }
    }
  } catch {
    return null;
  }

  if (canvasLooksLikePlaceholder(ctx, sizePx)) return null;

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Stitched Esri World Imagery for the cut, as PNG bytes. Returns null when tiles fail. */
export async function fetchSatelliteFramePng(
  model: CityModel,
  sizePx = 512,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  for (const zoom of SATELLITE_ZOOMS) {
    const png = await stitchAtZoom(model, sizePx, zoom, fetchImpl);
    if (png) return png;
  }
  return null;
}

export function satelliteFrameDataUrl(png: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i]!);
  return `data:image/png;base64,${btoa(binary)}`;
}
