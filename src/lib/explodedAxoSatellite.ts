import { squareBBox } from "./geo";
import { webMercatorPixel } from "./terrain";
import type { CityModel } from "../types";

const TILE = 256;
const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function tileUrl(z: number, x: number, y: number): string {
  return SATELLITE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** Stitched Esri World Imagery for the cut, as PNG bytes. Returns null when tiles fail. */
export async function fetchSatelliteFramePng(
  model: CityModel,
  sizePx = 512,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  const bounds = squareBBox(model.center, model.sideM);
  const zoom = 16;
  const nw = webMercatorPixel(bounds.west, bounds.north, zoom);
  const se = webMercatorPixel(bounds.east, bounds.south, zoom);
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

  try {
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const response = await fetchImpl(tileUrl(zoom, tx, ty));
        if (!response.ok) return null;
        const blob = await response.blob();
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

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function satelliteFrameDataUrl(png: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i]!);
  return `data:image/png;base64,${btoa(binary)}`;
}
