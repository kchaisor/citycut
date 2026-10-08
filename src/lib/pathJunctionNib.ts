import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";
import type { Pt } from "../types";

/** Both edges of a T-junction nib are shorter than this (m). */
export const NIB_MAX_EDGE_M = 1.5;

export type PathJunctionNib = {
  east: number;
  north: number;
  score: number;
  edge1M: number;
  edge2M: number;
  tipAngleDeg: number;
};

function openRing(ring: Ring): Pt[] {
  if (ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]) {
    return ring.slice(0, -1).map((p): Pt => [p[0], p[1]]);
  }
  return ring.map((p): Pt => [p[0], p[1]]);
}

function edgeLen(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function tipAngleDeg(prev: Pt, tip: Pt, next: Pt): number {
  const ax = tip[0] - prev[0];
  const ay = tip[1] - prev[1];
  const bx = next[0] - tip[0];
  const by = next[1] - tip[1];
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 180;
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  return (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
}

function nibScore(e1: number, e2: number, angleDeg: number): number {
  const shortness = (NIB_MAX_EDGE_M - e1) + (NIB_MAX_EDGE_M - e2);
  const sharpness = Math.max(0, 120 - angleDeg);
  return shortness * 2 + sharpness;
}

/** Scan footpath fill outers for convex T-junction nibs (short edge pairs). */
export function findPathJunctionNibs(pathFill: MultiPolygon, limit = 10): PathJunctionNib[] {
  const found: PathJunctionNib[] = [];
  for (const polygon of pathFill) {
    const outer = polygon[0];
    if (!outer) continue;
    const open = openRing(outer);
    const n = open.length;
    if (n < 4) continue;
    for (let i = 0; i < n; i++) {
      const prev = open[(i + n - 1) % n]!;
      const tip = open[i]!;
      const next = open[(i + 1) % n]!;
      const e1 = edgeLen(prev, tip);
      const e2 = edgeLen(tip, next);
      if (e1 > NIB_MAX_EDGE_M || e2 > NIB_MAX_EDGE_M) continue;
      const angle = tipAngleDeg(prev, tip, next);
      if (angle > 55) continue;
      const score = nibScore(e1, e2, angle);
      found.push({
        east: tip[0],
        north: tip[1],
        score,
        edge1M: e1,
        edge2M: e2,
        tipAngleDeg: angle,
      });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const deduped: PathJunctionNib[] = [];
  for (const nib of found) {
    if (deduped.some((d) => Math.hypot(d.east - nib.east, d.north - nib.north) < 8)) continue;
    deduped.push(nib);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

export function nibsNear(pathFill: MultiPolygon, east: number, north: number, radiusM: number): PathJunctionNib[] {
  return findPathJunctionNibs(pathFill, 200).filter((n) => Math.hypot(n.east - east, n.north - north) <= radiusM);
}

export function viewBoxAround(east: number, north: number, w: number, h: number): string {
  const svgY = -north;
  return `${Math.round(east - w / 2)} ${Math.round(svgY - h / 2)} ${Math.round(w)} ${Math.round(h)}`;
}

function isNibVertex(prev: Pt, tip: Pt, next: Pt): boolean {
  return edgeLen(prev, tip) <= NIB_MAX_EDGE_M && edgeLen(tip, next) <= NIB_MAX_EDGE_M && tipAngleDeg(prev, tip, next) <= 55;
}

/** Remove T-junction nib tips from footpath outers after ring smoothing. */
export function collapsePathNibs(pathFill: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const polygon of pathFill) {
    const rings: Ring[] = [];
    for (let ri = 0; ri < polygon.length; ri++) {
      const open = openRing(polygon[ri]!);
      if (open.length < 4) {
        rings.push(polygon[ri]!);
        continue;
      }
      const kept: Pt[] = [];
      const n = open.length;
      for (let i = 0; i < n; i++) {
        const prev = open[(i + n - 1) % n]!;
        const tip = open[i]!;
        const next = open[(i + 1) % n]!;
        if (isNibVertex(prev, tip, next)) continue;
        kept.push(tip);
      }
      if (kept.length >= 3) {
        kept.push(kept[0]!);
        rings.push(kept.map((p): Ring[0] => [p[0], p[1]]));
      } else {
        rings.push(polygon[ri]!);
      }
    }
    if (rings.length > 0) out.push(rings as Polygon);
  }
  return out;
}
