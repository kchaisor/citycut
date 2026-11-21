import type { LonLat, TerrainField } from "../types";
import { preferredTerrainZoom, terrainGridSize } from "./terrain";

export type QaTerrainKind = "ridge" | "flat";

export const QA_TERRAIN_SOURCE = "QA synthetic terrain";
export const QA_TERRAIN_BASE_M = 0.25;
export const QA_TERRAIN_RELIEF_M = 28;

export function qaTerrainFromSearch(search: string): QaTerrainKind | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("qa") !== "1") return null;
  const value = params.get("qaTerrain");
  return value === "ridge" || value === "flat" ? value : null;
}

function ridgeHeight(east: number, north: number, sideM: number): number {
  const across = (east - north) / Math.SQRT2;
  const sigma = sideM * 0.2;
  return QA_TERRAIN_BASE_M + QA_TERRAIN_RELIEF_M * Math.exp(-(across * across) / (2 * sigma * sigma));
}

export function qaTerrainField(kind: QaTerrainKind, center: LonLat, sideM: number): TerrainField {
  const zoom = preferredTerrainZoom(center.lat);
  const { cols, rows, spacingM, metresPerPixel } = terrainGridSize(center.lat, sideM, zoom);
  const half = sideM / 2;
  const heights = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const h = kind === "flat" ? QA_TERRAIN_BASE_M : ridgeHeight(-half + col * spacingM, -half + row * spacingM, sideM);
      heights[row * cols + col] = h;
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
  }
  return { cols, rows, heights, min, max, spacingM, zoom, metresPerPixel, source: QA_TERRAIN_SOURCE };
}
