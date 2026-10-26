import { getColour } from "./colours";
import { planPointToIso } from "./explodedAxo";
import { squareBBox } from "./geo";
import { sampleTerrain } from "./terrain";
import type { CityModel, TerrainField } from "../types";

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

export type DrapedSatelliteImage = {
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function loadHtmlImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Warp/drape the stitched satellite PNG onto the 3D terrain mesh `(east, north, z_terrain)`
 * in Exploded axo local coordinates (lift 0) using an offscreen 2D canvas triangle mesh.
 * Applies subtle directional slope shading so the 3D landform relief reads crisply under the imagery.
 */
export async function drapeSatelliteOnTerrain(
  satelliteDataUrl: string,
  sideM: number,
  field: TerrainField,
  exaggeration = 1,
  gridSteps = 40,
): Promise<DrapedSatelliteImage | null> {
  if (typeof document === "undefined") return null;
  if (field.max - field.min <= 1e-3 || exaggeration <= 0) return null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.setTransform !== "function") return null;

  const img = await loadHtmlImage(satelliteDataUrl);
  if (!img || !img.width || !img.height) return null;

  const n = Math.max(8, Math.min(64, Math.round(gridSteps)));
  const half = sideM / 2;
  const stride = n + 1;
  const isoX = new Float64Array(stride * stride);
  const isoY = new Float64Array(stride * stride);
  const liftZ = new Float64Array(stride * stride);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let j = 0; j <= n; j += 1) {
    const v = j / n;
    const north = -half + v * sideM;
    for (let i = 0; i <= n; i += 1) {
      const u = i / n;
      const east = -half + u * sideM;
      const z = Math.max(0, (sampleTerrain(field, east, north, sideM) - field.min) * exaggeration);
      const [px, py] = planPointToIso(east, north, z);
      const idx = j * stride + i;
      isoX[idx] = px;
      isoY[idx] = py;
      liftZ[idx] = z;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }

  const marginM = sideM * 0.008;
  minX -= marginM;
  minY -= marginM;
  maxX += marginM;
  maxY += marginM;

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX <= 1e-3 || spanY <= 1e-3) return null;

  const canvasW = 960;
  const canvasH = Math.max(64, Math.round(canvasW * (spanY / spanX)));
  canvas.width = canvasW;
  canvas.height = canvasH;

  const imgW = img.width;
  const imgH = img.height;
  const cellM = sideM / n;
  const sunHighlight = getColour("--axo-building-roof");
  const shadeTint = getColour("--ground-edge");

  const toCanvasX = (x: number) => ((x - minX) / spanX) * canvasW;
  const toCanvasY = (y: number) => ((y - minY) / spanY) * canvasH;

  const drawTriangle = (
    idx0: number,
    u0: number,
    v0: number,
    idx1: number,
    u1: number,
    v1: number,
    idx2: number,
    u2: number,
    v2: number,
    dzDe: number,
    dzDn: number,
  ) => {
    const sx0 = u0 * imgW;
    const sy0 = v0 * imgH;
    const sx1 = u1 * imgW;
    const sy1 = v1 * imgH;
    const sx2 = u2 * imgW;
    const sy2 = v2 * imgH;

    const dx0 = toCanvasX(isoX[idx0]!);
    const dy0 = toCanvasY(isoY[idx0]!);
    const dx1 = toCanvasX(isoX[idx1]!);
    const dy1 = toCanvasY(isoY[idx1]!);
    const dx2 = toCanvasX(isoX[idx2]!);
    const dy2 = toCanvasY(isoY[idx2]!);

    const dsx1 = sx1 - sx0;
    const dsy1 = sy1 - sy0;
    const dsx2 = sx2 - sx0;
    const dsy2 = sy2 - sy0;
    const det = dsx1 * dsy2 - dsy1 * dsx2;
    if (Math.abs(det) < 1e-6) return;

    const ddx1 = dx1 - dx0;
    const ddy1 = dy1 - dy0;
    const ddx2 = dx2 - dx0;
    const ddy2 = dy2 - dy0;

    const a = (ddx1 * dsy2 - ddx2 * dsy1) / det;
    const c = (dsx1 * ddx2 - dsx2 * ddx1) / det;
    const e = dx0 - a * sx0 - c * sy0;
    const b = (ddy1 * dsy2 - ddy2 * dsy1) / det;
    const d = (dsx1 * ddy2 - dsx2 * ddy1) / det;
    const f = dy0 - b * sx0 - d * sy0;

    // Expand triangle clip slightly outward from centroid to prevent sub-pixel antialiasing seams
    const cx = (dx0 + dx1 + dx2) / 3;
    const cy = (dy0 + dy1 + dy2) / 3;
    const expand = (px: number, py: number): [number, number] => {
      const vx = px - cx;
      const vy = py - cy;
      const len = Math.hypot(vx, vy);
      if (len < 1e-4) return [px, py];
      const pad = 0.55;
      return [px + (vx / len) * pad, py + (vy / len) * pad];
    };
    const [ex0, ey0] = expand(dx0, dy0);
    const [ex1, ey1] = expand(dx1, dy1);
    const [ex2, ey2] = expand(dx2, dy2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex0, ey0);
    ctx.lineTo(ex1, ey1);
    ctx.lineTo(ex2, ey2);
    ctx.closePath();
    ctx.clip();

    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);

    // Directional hillshade (sun from NW / upper-left in iso screen space)
    const norm = Math.hypot(1, dzDe, dzDn);
    const illum = (-dzDe * 0.65 + dzDn * 0.55) / norm;
    if (Math.abs(illum) > 0.015) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = illum > 0 ? sunHighlight : shadeTint;
      ctx.globalAlpha = illum > 0 ? Math.min(0.18, illum * 0.28) : Math.min(0.24, -illum * 0.34);
      ctx.fill();
    }
    ctx.restore();
  };

  // Painter's order: increasing (i + j) goes from back (-east, -north) to front (+east, +north)
  for (let diag = 0; diag <= 2 * (n - 1); diag += 1) {
    const iMin = Math.max(0, diag - (n - 1));
    const iMax = Math.min(n - 1, diag);
    for (let i = iMin; i <= iMax; i += 1) {
      const j = diag - i;
      const idx00 = j * stride + i;
      const idx10 = j * stride + (i + 1);
      const idx01 = (j + 1) * stride + i;
      const idx11 = (j + 1) * stride + (i + 1);

      const u0 = i / n;
      const u1 = (i + 1) / n;
      const v0 = j / n;
      const v1 = (j + 1) / n;

      const z00 = liftZ[idx00]!;
      const z10 = liftZ[idx10]!;
      const z01 = liftZ[idx01]!;
      const z11 = liftZ[idx11]!;

      drawTriangle(
        idx00, u0, v0,
        idx10, u1, v0,
        idx01, u0, v1,
        (z10 - z00) / cellM,
        (z01 - z00) / cellM,
      );
      drawTriangle(
        idx10, u1, v0,
        idx11, u1, v1,
        idx01, u0, v1,
        (z11 - z01) / cellM,
        (z11 - z10) / cellM,
      );
    }
  }

  const outUrl = canvas.toDataURL("image/png");
  if (!outUrl || !outUrl.startsWith("data:image/png")) return null;
  return {
    href: outUrl,
    x: minX,
    y: minY,
    width: spanX,
    height: spanY,
  };
}
