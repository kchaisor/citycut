import type { Pt } from "../types";

/** Chaikin passes before buffering centreline geometry. */
export const CENTRELINE_CHAIKIN_ITERATIONS = 2;
/** When set below 180, vertices with more turn than this stay pinned (degrees). */
export const CENTRELINE_SHARP_TURN_DEG = 180;
/** Max distance a smoothed point may move from the original polyline (m). */
export const CENTRELINE_MAX_LATERAL_SHIFT_M = 0.5;
/** Junction endpoints closer than this share a pinned coordinate (m). */
export const CENTRELINE_JUNCTION_SNAP_M = 1.75;
/** Douglas–Peucker tolerance after Chaikin (m); 0 skips simplify. */
export const CENTRELINE_OUTPUT_SIMPLIFY_M = 0.12;

export type CentrelineSmoothStats = {
  polylines: number;
  skippedNoBend: number;
  skippedSharpKink: number;
  skippedTooFewPins: number;
  smoothed: number;
  revertedShift: number;
};

function wrapRad(delta: number): number {
  const tau = Math.PI * 2;
  let value = delta % tau;
  if (value <= -Math.PI) value += tau;
  if (value > Math.PI) value -= tau;
  return value;
}

function turnDeflectionDeg(prev: Pt, vertex: Pt, next: Pt): number {
  const inDir = Math.atan2(vertex[1] - prev[1], vertex[0] - prev[0]);
  const outDir = Math.atan2(next[1] - vertex[1], next[0] - vertex[0]);
  return (Math.abs(wrapRad(outDir - inDir)) * 180) / Math.PI;
}

function pointsNear(a: Pt, b: Pt, toleranceM: number): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= toleranceM;
}

function pointToSegmentDistance(point: Pt, start: Pt, end: Pt): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (len * len)));
  const qx = start[0] + t * dx;
  const qy = start[1] + t * dy;
  return Math.hypot(point[0] - qx, point[1] - qy);
}

/** Shortest distance from a point to any segment of an open polyline. */
export function maxLateralShift(original: Pt[], smoothed: Pt[]): number {
  let max = 0;
  for (const point of smoothed) {
    let best = Infinity;
    for (let i = 0; i < original.length - 1; i++) {
      best = Math.min(best, pointToSegmentDistance(point, original[i]!, original[i + 1]!));
    }
    max = Math.max(max, best);
  }
  return max;
}

export function pinnedVertexIndices(
  line: Pt[],
  junctionPoints: Pt[] = [],
  sharpTurnDeg = CENTRELINE_SHARP_TURN_DEG,
): number[] {
  if (line.length === 0) return [];
  const pinned = new Set<number>([0, line.length - 1]);
  if (sharpTurnDeg < 180) {
    for (let i = 1; i < line.length - 1; i++) {
      const turn = turnDeflectionDeg(line[i - 1]!, line[i]!, line[i + 1]!);
      if (turn >= sharpTurnDeg) pinned.add(i);
    }
  }
  for (const junction of junctionPoints) {
    for (let i = 0; i < line.length; i++) {
      if (pointsNear(line[i]!, junction, 0.05)) pinned.add(i);
    }
  }
  return [...pinned].sort((a, b) => a - b);
}

/** One open Chaikin pass with fixed endpoints. */
function chaikinOpenFixedEnds(points: Pt[]): Pt[] {
  if (points.length < 3) return points.slice();
  const out: Pt[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    if (i > 0) out.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
    if (i < points.length - 2) out.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
  }
  out.push(points[points.length - 1]!);
  return out;
}

function dedupeAdjacent(points: Pt[], epsilon = 0.02): Pt[] {
  const out: Pt[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > epsilon) out.push(point);
  }
  return out;
}

function simplifyOpenPolyline(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3 || !(tolerance > 0)) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const [start, end] = next;
    let max = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const dist = pointToSegmentDistance(points[i]!, points[start]!, points[end]!);
      if (dist > max) {
        max = dist;
        index = i;
      }
    }
    if (index >= 0 && max > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function smoothSegment(segment: Pt[], iterations: number): Pt[] {
  if (segment.length < 3 || iterations <= 0) return segment.slice();
  let current = segment.slice();
  for (let pass = 0; pass < iterations; pass++) {
    current = chaikinOpenFixedEnds(current);
    current[0] = segment[0]!;
    current[current.length - 1] = segment[segment.length - 1]!;
  }
  return dedupeAdjacent(current);
}

/** Collect junctions where an endpoint meets any vertex on another strip. */
export function junctionPointsFromStrips(strips: { line: Pt[] }[], snapM = CENTRELINE_JUNCTION_SNAP_M): Pt[] {
  const junctions: Pt[] = [];
  for (let si = 0; si < strips.length; si++) {
    const line = strips[si]!.line;
    if (line.length < 2) continue;
    for (const endpoint of [line[0]!, line[line.length - 1]!]) {
      let hitOther = false;
      for (let sj = 0; sj < strips.length; sj++) {
        if (si === sj) continue;
        for (const p of strips[sj]!.line) {
          if (pointsNear(p, endpoint, snapM)) {
            hitOther = true;
            break;
          }
        }
        if (hitOther) break;
      }
      if (!hitOther) continue;
      const dup = junctions.some((j) => pointsNear(j, endpoint, snapM));
      if (!dup) junctions.push(endpoint);
    }
  }
  return junctions;
}

function hasGentleBend(line: Pt[], minTurnDeg = 5): boolean {
  for (let i = 1; i < line.length - 1; i++) {
    if (turnDeflectionDeg(line[i - 1]!, line[i]!, line[i + 1]!) >= minTurnDeg) return true;
  }
  return false;
}

/** Skip polylines with a sharp kink — Chaikin would exceed the lateral shift cap. */
function hasSharpKink(line: Pt[], maxTurnDeg = 35): boolean {
  for (let i = 1; i < line.length - 1; i++) {
    if (turnDeflectionDeg(line[i - 1]!, line[i]!, line[i + 1]!) >= maxTurnDeg) return true;
  }
  return false;
}

type SmoothOutcome = "no_bend" | "sharp_kink" | "too_few_pins" | "reverted_shift" | "smoothed";

/**
 * Light Chaikin smoothing between pinned junction and endpoint vertices.
 * Falls back to the original line if lateral shift would exceed the bound.
 */
export function smoothCentreline(
  line: Pt[],
  options: {
    junctionPoints?: Pt[];
    iterations?: number;
    maxLateralShiftM?: number;
    sharpTurnDeg?: number;
    simplifyM?: number;
  } = {},
): Pt[] {
  const { line: result } = smoothCentrelineDetailed(line, options);
  return result;
}

export function smoothCentrelineDetailed(
  line: Pt[],
  options: {
    junctionPoints?: Pt[];
    iterations?: number;
    maxLateralShiftM?: number;
    sharpTurnDeg?: number;
    simplifyM?: number;
  } = {},
): { line: Pt[]; outcome: SmoothOutcome } {
  if (line.length < 3 || !hasGentleBend(line)) return { line: line.slice(), outcome: "no_bend" };
  if (hasSharpKink(line)) return { line: line.slice(), outcome: "sharp_kink" };
  const iterations = options.iterations ?? CENTRELINE_CHAIKIN_ITERATIONS;
  const maxShift = options.maxLateralShiftM ?? CENTRELINE_MAX_LATERAL_SHIFT_M;
  const junctionPoints = options.junctionPoints ?? [];
  const sharpTurnDeg = options.sharpTurnDeg ?? CENTRELINE_SHARP_TURN_DEG;
  const simplifyM = options.simplifyM ?? 0;
  const pins = pinnedVertexIndices(line, junctionPoints, sharpTurnDeg);
  if (pins.length < 2) return { line: line.slice(), outcome: "too_few_pins" };

  const smoothed: Pt[] = [];
  for (let pi = 0; pi < pins.length - 1; pi++) {
    const start = pins[pi]!;
    const end = pins[pi + 1]!;
    if (end <= start) continue;
    const segment = line.slice(start, end + 1);
    const part = smoothSegment(segment, iterations);
    if (pi === 0) smoothed.push(...part);
    else smoothed.push(...part.slice(1));
  }

  if (maxLateralShift(line, smoothed) > maxShift) return { line: line.slice(), outcome: "reverted_shift" };
  const simplified = simplifyM > 0 ? simplifyOpenPolyline(smoothed, simplifyM) : smoothed;
  return { line: simplified, outcome: "smoothed" };
}

export function smoothCentrelineStrips<T extends { line: Pt[]; width: number }>(
  strips: T[],
  snapM = CENTRELINE_JUNCTION_SNAP_M,
  options: { simplifyM?: number } = {},
): T[] {
  if (strips.length === 0) return strips;
  const junctions = junctionPointsFromStrips(strips, snapM);
  const simplifyM = options.simplifyM ?? 0;
  return strips.map((strip) => ({
    ...strip,
    line: smoothCentreline(strip.line, { junctionPoints: junctions, simplifyM }),
  }));
}

export function centrelineSmoothStats(
  strips: { line: Pt[] }[],
  snapM = CENTRELINE_JUNCTION_SNAP_M,
  options: { simplifyM?: number } = {},
): CentrelineSmoothStats {
  const stats: CentrelineSmoothStats = {
    polylines: strips.length,
    skippedNoBend: 0,
    skippedSharpKink: 0,
    skippedTooFewPins: 0,
    smoothed: 0,
    revertedShift: 0,
  };
  if (strips.length === 0) return stats;
  const junctions = junctionPointsFromStrips(strips, snapM);
  const simplifyM = options.simplifyM ?? 0;
  for (const strip of strips) {
    const { outcome } = smoothCentrelineDetailed(strip.line, { junctionPoints: junctions, simplifyM });
    if (outcome === "no_bend") stats.skippedNoBend++;
    else if (outcome === "sharp_kink") stats.skippedSharpKink++;
    else if (outcome === "too_few_pins") stats.skippedTooFewPins++;
    else if (outcome === "reverted_shift") stats.revertedShift++;
    else stats.smoothed++;
  }
  return stats;
}
