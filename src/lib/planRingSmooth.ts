import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";
import type { Pt } from "../types";
import { signedArea } from "./geo";

/** Max deviation from the original faceted boundary (m). */
export const PLAN_RING_SMOOTH_MAX_DEVIATION_M = 0.03;
/** Segments shorter than this may belong to a faceted arc run (m). */
const FACET_EDGE_MAX_M = 2.5;
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

function signedTurnRad(prev: Pair, curr: Pair, next: Pair): number {
  const ax = curr[0] - prev[0];
  const ay = curr[1] - prev[1];
  const bx = next[0] - curr[0];
  const by = next[1] - curr[1];
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  return Math.atan2(cross, dot);
}

function turnDeg(prev: Pair, curr: Pair, next: Pair): number {
  return (Math.abs(signedTurnRad(prev, curr, next)) * 180) / Math.PI;
}

function outEdgeM(open: Pair[], i: number, n: number): number {
  return len(open[i]!, open[(i + 1) % n]!);
}

function inEdgeM(open: Pair[], i: number, n: number): number {
  return len(open[(i + n - 1) % n]!, open[i]!);
}

function inFilletChain(open: Pair[], i: number, n: number): boolean {
  const prev = open[(i + n - 1) % n]!;
  const curr = open[i]!;
  const next = open[(i + 1) % n]!;
  const t = turnDeg(prev, curr, next);
  if (t > CORNER_TURN_DEG * 1.25) return false;
  const shortIn = inEdgeM(open, i, n) <= FACET_EDGE_MAX_M;
  const shortOut = outEdgeM(open, i, n) <= FACET_EDGE_MAX_M;
  if (shortIn && shortOut) return true;
  if (shortIn && !shortOut) return t < CORNER_TURN_DEG;
  if (!shortIn && shortOut) return t < CORNER_TURN_DEG;
  return false;
}

/** True when this vertex begins a faceted arc chain. */
function startsFacetRun(open: Pair[], i: number, n: number): boolean {
  if (!inFilletChain(open, i, n)) return false;
  return !inFilletChain(open, (i + n - 1) % n, n);
}

function continuesFacetRun(open: Pair[], i: number, n: number, sign: number): boolean {
  if (!inFilletChain(open, i, n)) return false;
  const prev = open[(i + n - 1) % n]!;
  const curr = open[i]!;
  const next = open[(i + 1) % n]!;
  const t = turnDeg(prev, curr, next);
  if (t > CORNER_TURN_DEG * 1.25) return false;
  return sameSign(signedTurnRad(prev, curr, next), sign) || t < 3;
}

function sameSign(a: number, b: number): boolean {
  return a !== 0 && b !== 0 && Math.sign(a) === Math.sign(b);
}

function circleFromThreePoints(a: Pair, b: Pair, c: Pair): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  const r = Math.hypot(a[0] - cx, a[1] - cy);
  if (!(r > 1e-6)) return null;
  return { cx, cy, r };
}

function fitArc(start: Pair, mid: Pair, end: Pair): { cx: number; cy: number; r: number; a0: number; sweep: number } | null {
  const circle = circleFromThreePoints(start, mid, end);
  if (!circle) return null;
  const { cx, cy, r } = circle;
  const a0 = Math.atan2(start[1] - cy, start[0] - cx);
  const a1 = Math.atan2(end[1] - cy, end[0] - cx);
  const midAng = Math.atan2(mid[1] - cy, mid[0] - cx);
  let sweep = a1 - a0;
  const containsMid = (s: number) => {
    const norm = (x: number) => {
      let v = x - a0;
      while (v <= -Math.PI) v += Math.PI * 2;
      while (v > Math.PI) v -= Math.PI * 2;
      return v;
    };
    const nm = norm(midAng);
    const ns = norm(a0 + s);
    return Math.sign(nm) === Math.sign(ns) && Math.abs(nm) <= Math.abs(ns) + 1e-6;
  };
  if (!containsMid(sweep)) sweep += sweep > 0 ? -Math.PI * 2 : Math.PI * 2;
  if (!containsMid(sweep)) return null;
  return { cx, cy, r, a0, sweep };
}

function pointOnArc(cx: number, cy: number, r: number, ang: number): Pair {
  return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
}

function maxDeviationToChain(points: Pair[], chain: Pair[]): number {
  let max = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i]!;
      const b = chain[i + 1]!;
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

function fitArcFromRun(start: Pair, mids: Pair[], end: Pair) {
  let best: ReturnType<typeof fitArc> = null;
  let bestDev = Infinity;
  const candidates = [mids[Math.floor(mids.length / 2)]!, mids[0]!, mids[mids.length - 1]!];
  for (const mid of candidates) {
    const fit = fitArc(start, mid, end);
    if (!fit) continue;
    const dev = maxDeviationToChain([mid], [start, mid, end]);
    if (dev < bestDev) {
      bestDev = dev;
      best = fit;
    }
  }
  return best;
}

/** Resample a circular arc with at least `minVertices` points (replacing facet run). */
function resampleArcRun(
  start: Pair,
  mids: Pair[],
  end: Pair,
  minVertices: number,
  chordStepM: number,
): Pair[] | null {
  if (mids.length === 0) return null;
  const fit = fitArcFromRun(start, mids, end);
  if (!fit) return null;
  const arcLen = Math.abs(fit.sweep) * fit.r;
  const steps = Math.min(
    Math.max(minVertices, Math.ceil(arcLen / Math.max(chordStepM, 0.008))),
    Math.max(minVertices, 24),
  );
  const out: Pair[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / (steps + 1);
    const ang = fit.a0 + fit.sweep * t;
    out.push(pointOnArc(fit.cx, fit.cy, fit.r, ang));
  }
  if (out.length < minVertices) return null;
  const chain = [start, ...mids, end];
  if (maxDeviationToChain(out, chain) > PLAN_RING_SMOOTH_MAX_DEVIATION_M * 1.5) return null;
  return out;
}

/** Count maximal runs of short same-sign turns (concave fillet chains). */
export function countConcaveArcRuns(ring: Ring): number {
  const open = openRing(ring);
  const n = open.length;
  if (n < 4) return 0;
  let count = 0;
  let i = 0;
  while (i < n) {
    if (!startsFacetRun(open, i, n)) {
      i++;
      continue;
    }
    const sign = signedTurnRad(open[(i + n - 1) % n]!, open[i]!, open[(i + 1) % n]!);
    let j = i + 1;
    while (j < n && continuesFacetRun(open, j, n, sign)) j++;
    if (j - i >= 2) count++;
    i = j;
  }
  return count;
}

export function countConcaveArcRunsMulti(pathFill: MultiPolygon): number {
  let total = 0;
  for (const polygon of pathFill) {
    const outer = polygon[0];
    if (outer) total += countConcaveArcRuns(outer);
  }
  return total;
}

/** Replace faceted arc runs with a denser circular-arc resample; never fewer vertices than the input run. */
export function smoothPlanRing(ring: Ring, maxDeviationM = PLAN_RING_SMOOTH_MAX_DEVIATION_M): Ring {
  const open = openRing(ring);
  const n = open.length;
  if (n < 4) return ring;
  const out: Pair[] = [];
  let i = 0;
  while (i < n) {
    if (!startsFacetRun(open, i, n)) {
      out.push(open[i]!);
      i++;
      continue;
    }
    const sign = signedTurnRad(open[(i + n - 1) % n]!, open[i]!, open[(i + 1) % n]!);
    let j = i + 1;
    while (j < n && continuesFacetRun(open, j, n, sign)) j++;
    const runLen = j - i;
    if (runLen < 2) {
      out.push(open[i]!);
      i++;
      continue;
    }
    const start = open[(i + n - 1) % n]!;
    const end = open[j % n]!;
    const mids = open.slice(i, j);
    const resampled = resampleArcRun(start, mids, end, runLen, maxDeviationM);
    if (resampled && resampled.length >= runLen) {
      out.push(...resampled);
    } else {
      for (let k = i; k < j; k++) out.push(open[k]!);
    }
    i = j;
  }
  const deduped: Pair[] = [];
  for (const p of out) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.015) deduped.push(p);
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
      rings.push(smoothPlanRing(ring));
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

/** CCW ring with a faceted inner quarter-circle fillet (for tests). */
export function quarterCircleFilletRing(radiusM: number, segments = 4): Ring {
  const pts: Pair[] = [[radiusM, 0], [0, 0], [0, radiusM]];
  for (let i = 1; i <= segments; i++) {
    const t = (Math.PI / 2) * (1 - i / segments);
    pts.push([radiusM * Math.cos(t), radiusM * Math.sin(t)]);
  }
  return closeRing(pts);
}
