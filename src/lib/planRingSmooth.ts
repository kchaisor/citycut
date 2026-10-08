import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";
import type { Pt } from "../types";
import { signedArea } from "./geo";

/** Max deviation from the original faceted boundary (m). */
export const PLAN_RING_SMOOTH_MAX_DEVIATION_M = 0.03;
/** Segments shorter than this may belong to a faceted arc run (m). */
const FACET_EDGE_MAX_M = 2.5;
/** Keep sharp corners when either adjacent edge is at least this long (m). */
const LONG_EDGE_M = 2.5;
/** Preserve vertices whose turn exceeds this (degrees). */
const CORNER_TURN_DEG = 35;

function openRing(ring: Ring): Pair[] {
  if (ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]) {
    return ring.slice(0, -1);
  }
  return ring.slice();
}

function closeRing(open: Pair[]): Ring {
  if (open.length === 0) return [];
  const first = open[0]!;
  const last = open[open.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return open as Ring;
  return [...open, first];
}

function len(a: Pair, b: Pair): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function turnDeg(prev: Pair, curr: Pair, next: Pair): number {
  const ax = curr[0] - prev[0];
  const ay = curr[1] - prev[1];
  const bx = next[0] - curr[0];
  const by = next[1] - curr[1];
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 180;
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  return (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
}

function shouldKeepCorner(prev: Pair, curr: Pair, next: Pair): boolean {
  const e1 = len(prev, curr);
  const e2 = len(curr, next);
  if (e1 >= LONG_EDGE_M || e2 >= LONG_EDGE_M) return turnDeg(prev, curr, next) >= CORNER_TURN_DEG;
  return turnDeg(prev, curr, next) >= CORNER_TURN_DEG * 1.4;
}

function isFacetVertex(prev: Pair, curr: Pair, next: Pair): boolean {
  const e1 = len(prev, curr);
  const e2 = len(curr, next);
  if (e1 > FACET_EDGE_MAX_M || e2 > FACET_EDGE_MAX_M) return false;
  const t = turnDeg(prev, curr, next);
  return t > 0.5 && t < CORNER_TURN_DEG;
}

function arcSample(a: Pair, b: Pair, c: Pair, stepM: number): Pair[] {
  const ab = len(a, b);
  const bc = len(b, c);
  if (ab < 1e-6 || bc < 1e-6) return [b];
  const mx = (a[0] + c[0]) / 2;
  const my = (a[1] + c[1]) / 2;
  const bx = b[0];
  const by = b[1];
  const dx = bx - mx;
  const dy = by - my;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return [b];
  const radius = (ab * bc) / (2 * dist);
  if (!(radius > 1e-6)) return [b];
  const cx = mx + (dx / dist) * radius;
  const cy = my + (dy / dist) * radius;
  const a0 = Math.atan2(a[1] - cy, a[0] - cx);
  const a2 = Math.atan2(c[1] - cy, c[0] - cx);
  let sweep = a2 - a0;
  while (sweep <= -Math.PI) sweep += Math.PI * 2;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  const arcLen = Math.abs(sweep) * radius;
  const steps = Math.max(2, Math.ceil(arcLen / Math.max(stepM, 0.01)));
  const out: Pair[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const ang = a0 + sweep * t;
    out.push([cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius]);
  }
  return out;
}

function maxDeviation(original: Pair[], simplified: Pair[]): number {
  let max = 0;
  for (const p of original) {
    let best = Infinity;
    for (let i = 0; i < simplified.length; i++) {
      const a = simplified[i]!;
      const b = simplified[(i + 1) % simplified.length]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-12) {
        best = Math.min(best, Math.hypot(p[0] - a[0], p[1] - a[1]));
        continue;
      }
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
    max = Math.max(max, best);
  }
  return max;
}

/** Replace faceted arc runs with a circular-arc resample; O(n) single pass. */
export function smoothPlanRing(ring: Ring, maxDeviationM = PLAN_RING_SMOOTH_MAX_DEVIATION_M): Ring {
  const open = openRing(ring);
  const n = open.length;
  if (n < 4) return ring;
  const keep = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const prev = open[(i + n - 1) % n]!;
    const curr = open[i]!;
    const next = open[(i + 1) % n]!;
    keep[i] = shouldKeepCorner(prev, curr, next);
  }
  const out: Pair[] = [];
  let i = 0;
  while (i < n) {
    if (keep[i]) {
      out.push(open[i]!);
      i++;
      continue;
    }
    const start = (i + n - 1) % n;
    let j = i;
    while (j < n && !keep[j] && isFacetVertex(open[(j + n - 1) % n]!, open[j]!, open[(j + 1) % n]!)) {
      j++;
    }
    if (j - i >= 2) {
      const a = open[start]!;
      const c = open[j % n]!;
      const mids: Pair[] = [];
      for (let k = i; k < j; k++) mids.push(open[k]!);
      const mid = mids[Math.floor(mids.length / 2)]!;
      const arc = arcSample(a, mid, c, maxDeviationM);
      const run = [a, ...mids, c];
      const dev = maxDeviation(run, [a, ...arc, c]);
      if (dev <= maxDeviationM * 1.5 && arc.length > 0) {
        out.push(...arc);
      } else {
        for (let k = i; k < j; k++) out.push(open[k]!);
      }
      i = j;
    } else {
      out.push(open[i]!);
      i++;
    }
  }
  const deduped: Pair[] = [];
  for (const p of out) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.02) deduped.push(p);
  }
  if (deduped.length < 3) return ring;
  if (Math.abs(signedArea(deduped)) < 0.5) return ring;
  return closeRing(deduped);
}

export function smoothPlanMultiPolygon(polygons: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const polygon of polygons) {
    const rings: Ring[] = [];
    for (let ri = 0; ri < polygon.length; ri++) {
      const ring = polygon[ri];
      if (!ring || ring.length < 4) continue;
      rings.push(ri === 0 ? smoothPlanRing(ring) : smoothPlanRing(ring));
    }
    if (rings.length > 0) out.push(rings as Polygon);
  }
  return out;
}

export function smoothPlanRings(rings: Pt[][]): Pt[][] {
  return rings.map((ring) => {
    const closed = ring.length > 0 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1];
    const asRing = (closed ? ring : [...ring, ring[0]!]) as Ring;
    const smoothed = smoothPlanRing(asRing);
    return smoothed.slice(0, -1).map((p): Pt => [p[0], p[1]]);
  });
}
