import type { CarParkArea, Pt, RoadFeat } from "../types";

/** `RoadFeat.service` value for car-park aisles. */
export const PARKING_AISLE = "parking_aisle";

/** Share of a service way's length that must lie inside a car park for the plan to draw it as car park. */
export const CAR_PARK_WAY_INSIDE_MIN = 0.6;
const SAMPLE_M = 2;

type Box = [number, number, number, number];

function boxOf(ring: Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function inRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Ways the site plan draws as car-park ground instead of road white: every parking aisle, plus any
 * other service way (aisle tagged as plain service, drive-through, driveway) that runs mostly
 * inside a mapped car park. Plan-only; 3D, .3dm and city blocks keep every carriageway.
 */
export function carParkWays(roads: RoadFeat[], carParks: CarParkArea[] | undefined): Set<RoadFeat> {
  const out = new Set<RoadFeat>();
  const parks = (carParks ?? []).filter((p) => p.ring.length >= 4).map((p) => ({ ...p, box: boxOf(p.ring) }));
  for (const road of roads) {
    if (road.kind !== "road" || !road.service) continue;
    if (road.service === PARKING_AISLE) {
      out.add(road);
      continue;
    }
    if (parks.length === 0 || road.line.length < 2) continue;
    let total = 0;
    let inside = 0;
    for (let i = 0; i + 1 < road.line.length; i++) {
      const a = road.line[i]!;
      const b = road.line[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / SAMPLE_M));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        total += len / n;
        const hit = parks.some(
          (park) =>
            p[0] >= park.box[0] && p[0] <= park.box[2] && p[1] >= park.box[1] && p[1] <= park.box[3] &&
            inRing(p, park.ring) && !park.holes.some((hole) => inRing(p, hole)),
        );
        if (hit) inside += len / n;
      }
    }
    if (total > 0 && inside / total >= CAR_PARK_WAY_INSIDE_MIN) out.add(road);
  }
  return out;
}
