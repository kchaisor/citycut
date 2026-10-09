import type { Pt, RoadFeat } from "../types";
import type { MultiPolygon, Polygon } from "polygon-clipping";

export function mixGeometryHash(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}

export function hashLineCoords(hash: number, line: Pt[]): number {
  let h = mixGeometryHash(hash, line.length);
  for (const [x, y] of line) {
    h = mixGeometryHash(h, Math.round(x * 100));
    h = mixGeometryHash(h, Math.round(y * 100));
  }
  return h;
}

export function hashRoadFeatures(roads: RoadFeat[]): string {
  let h = 2166136261;
  for (const road of roads) {
    h = mixGeometryHash(h, road.id);
    h = mixGeometryHash(h, Math.round(road.width * 100));
    h = hashLineCoords(h, road.line);
  }
  return h.toString(16);
}

export function hashStripLines(lines: Pt[][], widthM: number, filletM: number): string {
  let h = mixGeometryHash(2166136261, Math.round(widthM * 100));
  h = mixGeometryHash(h, Math.round(filletM * 100));
  for (const line of lines) h = hashLineCoords(h, line);
  return h.toString(16);
}

export function hashMultiPolygon(multi: MultiPolygon): string {
  let h = 2166136261;
  h = mixGeometryHash(h, multi.length);
  for (const polygon of multi) h = hashPolygon(h, polygon);
  return h.toString(16);
}

export function hashPolygon(hash: number, polygon: Polygon): number {
  let h = mixGeometryHash(hash, polygon.length);
  for (const ring of polygon) h = hashLineCoords(h, ring.map((p): Pt => [p[0], p[1]]));
  return h;
}
