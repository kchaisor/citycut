import type { ExtrusionPartRecord } from "./buildCity";
import type { Pt, Ring } from "../types";

/** A building part ready for a Rhino Extrusion: closed MGA rings, origin, base and plan bounds. */
export type ExtrusionPoints = {
  /** First MGA vertex of the outer ring. Profiles are built relative to it, then moved back. */
  origin: [number, number];
  /** Closed rings (first point repeated last) in full MGA easting/northing. */
  outer: number[][];
  holes: number[][][];
  base: number;
  height: number;
  /** [minE, minN, maxE, maxN] of the outer ring. */
  bounds: [number, number, number, number];
};

const MIN_GAP_M = 0.001;

/** Open ring with consecutive duplicates (within 1 mm) and a repeated closing point removed. */
function cleanRing(ring: Ring, project: (pt: Pt) => [number, number]): number[][] {
  const points: number[][] = [];
  for (const pt of ring) {
    const [e, n] = project(pt);
    const last = points[points.length - 1];
    if (last && Math.hypot(last[0] - e, last[1] - n) < MIN_GAP_M) continue;
    points.push([e, n]);
  }
  while (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) >= MIN_GAP_M) break;
    points.pop();
  }
  return points;
}

function area(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function orientation(a: number[], b: number[], c: number[]): number {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(value) < 1e-9 ? 0 : Math.sign(value);
}

function onSegment(a: number[], b: number[], p: number[]): boolean {
  return (
    Math.min(a[0], b[0]) - 1e-9 <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    Math.min(a[1], b[1]) - 1e-9 <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}

function segmentsCross(a: number[], b: number[], c: number[], d: number[]): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** True when any two non-adjacent edges across all rings touch or cross. */
export function ringsSelfIntersect(rings: number[][][]): boolean {
  const edges: { a: number[]; b: number[]; ring: number; index: number; count: number }[] = [];
  rings.forEach((ring, r) => {
    for (let i = 0; i < ring.length; i++) edges.push({ a: ring[i], b: ring[(i + 1) % ring.length], ring: r, index: i, count: ring.length });
  });
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const eMinX = Math.min(e.a[0], e.b[0]);
    const eMaxX = Math.max(e.a[0], e.b[0]);
    const eMinY = Math.min(e.a[1], e.b[1]);
    const eMaxY = Math.max(e.a[1], e.b[1]);
    for (let j = i + 1; j < edges.length; j++) {
      const f = edges[j];
      if (e.ring === f.ring) {
        const gap = Math.abs(e.index - f.index);
        if (gap === 1 || gap === e.count - 1) continue;
      }
      if (Math.max(f.a[0], f.b[0]) < eMinX || Math.min(f.a[0], f.b[0]) > eMaxX) continue;
      if (Math.max(f.a[1], f.b[1]) < eMinY || Math.min(f.a[1], f.b[1]) > eMaxY) continue;
      if (segmentsCross(e.a, e.b, f.a, f.b)) return true;
    }
  }
  return false;
}

function inside(point: number[], ring: number[][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const close = (ring: number[][]) => [...ring, [...ring[0]]];

/**
 * MGA rings for one building part, or null when it should stay a mesh: fewer than 3 points,
 * no area or height, a self-intersecting outline, or a courtyard not inside the outline.
 */
export function buildingExtrusionPoints(
  part: ExtrusionPartRecord,
  project: (pt: Pt) => [number, number],
): ExtrusionPoints | null {
  if (!(part.height > 0) || !Number.isFinite(part.base)) return null;
  const outer = cleanRing(part.ring, project);
  if (outer.length < 3 || Math.abs(area(outer)) < 1e-4) return null;
  const holes = part.holes.map((hole) => cleanRing(hole, project));
  if (holes.some((hole) => hole.length < 3 || Math.abs(area(hole)) < 1e-4)) return null;
  if (ringsSelfIntersect([outer, ...holes])) return null;
  if (holes.some((hole) => !inside(hole[0], outer))) return null;
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (const [e, n] of outer) {
    minE = Math.min(minE, e);
    minN = Math.min(minN, n);
    maxE = Math.max(maxE, e);
    maxN = Math.max(maxN, n);
  }
  return {
    origin: [outer[0][0], outer[0][1]],
    outer: close(outer),
    holes: holes.map(close),
    base: part.base,
    height: part.height,
    bounds: [minE, minN, maxE, maxN],
  };
}
