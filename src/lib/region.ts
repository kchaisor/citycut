import states from "../content/regions/auStates.json";
import cityOfSydney from "../content/regions/cityOfSydney.json";
import { mPerDegLon, M_PER_DEG_LAT } from "./geo";
import type { LonLat } from "../types";

export type RegionId = "vic" | "nsw";

export type RegionDetection = {
  region: RegionId | null;
  how: "inside" | "nearest" | "outside";
  note: string | null;
  snapKm?: number;
};

type Rings = number[][][];
type Multi = Rings[];

const OUTLINES: Record<"VIC" | "NSW" | "ACT", Multi> = {
  VIC: (states as { VIC: Multi }).VIC,
  NSW: (states as { NSW: Multi }).NSW,
  ACT: (states as { ACT: Multi }).ACT,
};

export const REGION_SNAP_KM = 30;

function ringContains(ring: number[][], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function multiContains(multi: Multi, lon: number, lat: number): boolean {
  for (const polygon of multi) {
    if (!polygon[0] || !ringContains(polygon[0], lon, lat)) continue;
    if (polygon.slice(1).some((hole) => ringContains(hole, lon, lat))) continue;
    return true;
  }
  return false;
}

function distanceKm(multi: Multi, at: LonLat): number {
  const kx = mPerDegLon(at.lat) / 1000;
  const ky = M_PER_DEG_LAT / 1000;
  let best = Infinity;
  for (const polygon of multi) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = (ring[i]![0]! - at.lon) * kx;
        const ay = (ring[i]![1]! - at.lat) * ky;
        const bx = (ring[i + 1]![0]! - at.lon) * kx;
        const by = (ring[i + 1]![1]! - at.lat) * ky;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
      }
    }
  }
  return best;
}

export function detectRegion(center: LonLat): RegionDetection {
  if (multiContains(OUTLINES.ACT, center.lon, center.lat)) {
    return { region: null, how: "outside", note: "This cut is in the ACT. CityCut has no ACT state layers yet; national sources only." };
  }
  if (multiContains(OUTLINES.VIC, center.lon, center.lat)) return { region: "vic", how: "inside", note: null };
  if (multiContains(OUTLINES.NSW, center.lon, center.lat)) return { region: "nsw", how: "inside", note: null };
  const vic = distanceKm(OUTLINES.VIC, center);
  const nsw = distanceKm(OUTLINES.NSW, center);
  const nearest: RegionId = vic <= nsw ? "vic" : "nsw";
  const km = Math.min(vic, nsw);
  if (km <= REGION_SNAP_KM) return { region: nearest, how: "nearest", note: null, snapKm: km };
  return { region: null, how: "outside", note: null };
}

export const CITY_OF_SYDNEY_RINGS: number[][][] = (cityOfSydney as { rings: number[][][] }).rings;

export function insideCityOfSydney(lon: number, lat: number): boolean {
  return multiContains([CITY_OF_SYDNEY_RINGS], lon, lat);
}

export function boundsTouchCityOfSydney(bounds: { west: number; south: number; east: number; north: number }): boolean {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const ring of CITY_OF_SYDNEY_RINGS) {
    for (const [x, y] of ring) {
      w = Math.min(w, x!);
      e = Math.max(e, x!);
      s = Math.min(s, y!);
      n = Math.max(n, y!);
    }
  }
  if (bounds.east < w || bounds.west > e || bounds.north < s || bounds.south > n) return false;
  const pts: [number, number][] = [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
    [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2],
  ];
  if (pts.some(([x, y]) => insideCityOfSydney(x, y))) return true;
  return CITY_OF_SYDNEY_RINGS.some((ring) =>
    ring.some(([x, y]) => x! >= bounds.west && x! <= bounds.east && y! >= bounds.south && y! <= bounds.north),
  );
}
