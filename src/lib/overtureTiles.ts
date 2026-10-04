import { clipPolylineRect } from "./clip";
import { dedupeConsecutive, signedArea, toLocal } from "./geo";
import type { LonLat, Pt } from "../types";

export function tileRange(
  bounds: { south: number; west: number; north: number; east: number },
  z: number,
): { z: number; x: number; y: number }[] {
  const n = 2 ** z;
  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);
  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const yFor = (lat: number) =>
    Math.floor(((1 - Math.log(Math.tan(latRad(lat)) + 1 / Math.cos(latRad(lat))) / Math.PI) / 2) * n);
  const yMin = Math.min(yFor(bounds.north), yFor(bounds.south));
  const yMax = Math.max(yFor(bounds.north), yFor(bounds.south));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

function tileLat(y: number, n: number): number {
  const rad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return (rad * 180) / Math.PI;
}

/** Tile corners in east/north metres relative to `origin`. */
export function tileLocalRect(
  z: number,
  x: number,
  y: number,
  origin: LonLat,
): { minE: number; maxE: number; minN: number; maxN: number } {
  const n = 2 ** z;
  const lonWest = (x / n) * 360 - 180;
  const lonEast = ((x + 1) / n) * 360 - 180;
  const latNorth = tileLat(y, n);
  const latSouth = tileLat(y + 1, n);
  const corners: Pt[] = [
    toLocal(latNorth, lonWest, origin),
    toLocal(latNorth, lonEast, origin),
    toLocal(latSouth, lonWest, origin),
    toLocal(latSouth, lonEast, origin),
  ];
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [east, north] of corners) {
    minE = Math.min(minE, east);
    maxE = Math.max(maxE, east);
    minN = Math.min(minN, north);
    maxN = Math.max(maxN, north);
  }
  return { minE, maxE, minN, maxN };
}

export function clipBoundsForTile(half: number, tile: ReturnType<typeof tileLocalRect>): {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
} | null {
  const minE = Math.max(-half, tile.minE);
  const maxE = Math.min(half, tile.maxE);
  const minN = Math.max(-half, tile.minN);
  const maxN = Math.min(half, tile.maxN);
  if (minE >= maxE - 0.01 || minN >= maxN - 0.01) return null;
  return { minE, maxE, minN, maxN };
}

export function clipPolylineToRect(line: Pt[], rect: { minE: number; maxE: number; minN: number; maxN: number }): Pt[][] {
  const parts = clipPolylineRect(line, rect);
  return parts.map((part) => dedupeConsecutive(part, 0.1)).filter((part) => part.length >= 2);
}

export function clipPolygonToRect(
  ring: Pt[],
  rect: { minE: number; maxE: number; minN: number; maxN: number },
): Pt[] {
  const min = Math.max(rect.minE, rect.minN);
  const max = Math.min(rect.maxE, rect.maxN);
  if (min >= max) return [];
  // Approximate: clip to cut-style square containing intersection (tiles are small)
  const minE = rect.minE;
  const maxE = rect.maxE;
  const minN = rect.minN;
  const maxN = rect.maxN;
  let output = ring.slice();
  const slack = 1e-6;
  const clipHalf = (
    input: Pt[],
    inside: (point: Pt) => boolean,
    intersect: (a: Pt, b: Pt) => Pt,
  ): Pt[] => {
    if (input.length === 0) return [];
    const out: Pt[] = [];
    let previous = input[input.length - 1];
    let previousInside = inside(previous);
    for (const point of input) {
      const currentInside = inside(point);
      if (currentInside) {
        if (!previousInside) out.push(intersect(previous, point));
        out.push(point);
      } else if (previousInside) {
        out.push(intersect(previous, point));
      }
      previous = point;
      previousInside = currentInside;
    }
    return out;
  };
  const hitX = (a: Pt, b: Pt, x: number): Pt => {
    const dx = b[0] - a[0];
    if (Math.abs(dx) < 1e-12) return [x, a[1]];
    const t = (x - a[0]) / dx;
    return [x, a[1] + (b[1] - a[1]) * t];
  };
  const hitY = (a: Pt, b: Pt, y: number): Pt => {
    const dy = b[1] - a[1];
    if (Math.abs(dy) < 1e-12) return [a[0], y];
    const t = (y - a[1]) / dy;
    return [a[0] + (b[0] - a[0]) * t, y];
  };
  output = clipHalf(output, (p) => p[0] >= minE - slack, (a, b) => hitX(a, b, minE));
  output = clipHalf(output, (p) => p[0] <= maxE + slack, (a, b) => hitX(a, b, maxE));
  output = clipHalf(output, (p) => p[1] >= minN - slack, (a, b) => hitY(a, b, minN));
  output = clipHalf(output, (p) => p[1] <= maxN + slack, (a, b) => hitY(a, b, maxN));
  return output;
}

export function lineFromGeoJson(
  coordinates: number[][],
  origin: LonLat,
  _half: number,
  tileRect: ReturnType<typeof clipBoundsForTile>,
): Pt[][] {
  const raw: Pt[] = coordinates.map(([lon, lat]) => toLocal(lat, lon, origin));
  const points = dedupeConsecutive(raw, 0.08);
  if (points.length < 2) return [];
  if (!tileRect) return [];
  return clipPolylineToRect(points, tileRect);
}

export function polygonFromGeoJson(
  coordinates: number[][][],
  origin: LonLat,
  tileRect: ReturnType<typeof clipBoundsForTile>,
  minArea: number,
): { ring: Pt[]; holes: Pt[][] } | null {
  if (!tileRect) return null;
  const toRing = (loop: number[][]): Pt[] =>
    dedupeConsecutive(
      loop.map(([lon, lat]) => toLocal(lat, lon, origin)),
      0.12,
    );
  const clippedOuter = clipPolygonToRect(toRing(coordinates[0]), tileRect);
  if (clippedOuter.length < 3) return null;
  if (Math.abs(signedArea(clippedOuter)) < minArea) return null;
  const holes = coordinates
    .slice(1)
    .map((loop) => clipPolygonToRect(toRing(loop), tileRect))
    .filter((hole) => hole.length >= 3);
  return { ring: clippedOuter, holes };
}

export function stableNumericId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
