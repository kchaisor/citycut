import type { Pt } from "../types";

/** Vertices with more turn than this stay pinned (degrees). */
export const CENTRELINE_SHARP_TURN_DEG = 35;
/** Max deviation from a circular arc when densifying curved runs (m). */
export const CENTRELINE_CHORD_ERROR_M = 0.05;
/** Max distance a densified point may move from the original polyline (m). */
export const CENTRELINE_MAX_LATERAL_SHIFT_M = 0.5;
/** Endpoints within this distance of another way's vertex count as a shared junction (m). */
export const CENTRELINE_JUNCTION_SNAP_M = 1.75;
/** Douglas–Peucker tolerance after densify (m); 0 skips simplify. */
export const CENTRELINE_OUTPUT_SIMPLIFY_M = 0;

/** @deprecated Chaikin is no longer used; kept for scripts that import the name. */
export const CENTRELINE_CHAIKIN_ITERATIONS = 0;

export type CentrelineDensifyProfile = {
  minEdgeDensifyM: number;
  maxStepsPerEdge: number;
  minLongEdgeM: number;
  /** When true, gentle runs use centripetal Catmull–Rom (still bounded by max lateral shift). */
  catmullOnGentleRuns: boolean;
  maxLateralShiftM: number;
};

export const ROAD_CENTRELINE_DENSIFY: CentrelineDensifyProfile = {
  minEdgeDensifyM: 4,
  maxStepsPerEdge: 4,
  minLongEdgeM: 4,
  catmullOnGentleRuns: false,
  maxLateralShiftM: CENTRELINE_MAX_LATERAL_SHIFT_M,
};

export const FOOTPATH_CENTRELINE_DENSIFY: CentrelineDensifyProfile = {
  minEdgeDensifyM: 4,
  maxStepsPerEdge: 6,
  minLongEdgeM: 4,
  catmullOnGentleRuns: true,
  maxLateralShiftM: 0.12,
};

const centrelineCache = new Map<string, Pt[]>();
const CENTRELINE_CACHE_LIMIT = 512;

export function clearCentrelineCacheForTests(): void {
  centrelineCache.clear();
}

function lineCacheKey(line: Pt[], profile: CentrelineDensifyProfile): string {
  const picks = [0, Math.floor(line.length / 2), line.length - 1]
    .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
    .map((i) => line[i]!);
  const coords = picks.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("|");
  return `${line.length}:${coords}:${profile.minEdgeDensifyM}:${profile.catmullOnGentleRuns ? 1 : 0}`;
}

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

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Step length for linear edge densify (m); keeps points on the original polyline. */
function edgeDensifyStepM(edgeLen: number, chordErrorM: number): number {
  return Math.max(0.35, Math.min(0.55, Math.sqrt(Math.max(edgeLen, chordErrorM) * chordErrorM * 8)));
}

function catmullRomCentripetal(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const alpha = 0.5;
  const tj = (ti: number, a: Pt, b: Pt) => ti + dist(a, b) ** alpha;
  const t0 = 0;
  const t1 = tj(t0, p0, p1);
  const t2 = tj(t1, p1, p2);
  const t3 = tj(t2, p2, p3);
  const u = t1 + t * (t2 - t1);
  const a1: Pt = [
    ((t1 - u) / (t1 - t0)) * p0[0] + ((u - t0) / (t1 - t0)) * p1[0],
    ((t1 - u) / (t1 - t0)) * p0[1] + ((u - t0) / (t1 - t0)) * p1[1],
  ];
  const a2: Pt = [
    ((t2 - u) / (t2 - t1)) * p1[0] + ((u - t1) / (t2 - t1)) * p2[0],
    ((t2 - u) / (t2 - t1)) * p1[1] + ((u - t1) / (t2 - t1)) * p2[1],
  ];
  const a3: Pt = [
    ((t3 - u) / (t3 - t2)) * p2[0] + ((u - t2) / (t3 - t2)) * p3[0],
    ((t3 - u) / (t3 - t2)) * p2[1] + ((u - t2) / (t3 - t2)) * p3[1],
  ];
  const b1: Pt = [
    ((t2 - u) / (t2 - t0)) * a1[0] + ((u - t0) / (t2 - t0)) * a2[0],
    ((t2 - u) / (t2 - t0)) * a1[1] + ((u - t0) / (t2 - t0)) * a2[1],
  ];
  const b2: Pt = [
    ((t3 - u) / (t3 - t1)) * a2[0] + ((u - t1) / (t3 - t1)) * a3[0],
    ((t3 - u) / (t3 - t1)) * a2[1] + ((u - t1) / (t3 - t1)) * a3[1],
  ];
  return [
    ((t2 - u) / (t2 - t1)) * b1[0] + ((u - t1) / (t2 - t1)) * b2[0],
    ((t2 - u) / (t2 - t1)) * b1[1] + ((u - t1) / (t2 - t1)) * b2[1],
  ];
}

function segmentAllGentle(segment: Pt[], maxTurnDeg: number): boolean {
  if (segment.length < 3) return true;
  for (let i = 1; i < segment.length - 1; i++) {
    if (turnDeflectionDeg(segment[i - 1]!, segment[i]!, segment[i + 1]!) >= maxTurnDeg) return false;
  }
  return true;
}

/** Add vertices along curved runs without leaving the source polyline (endpoints exact). */
function densifyLinearSegment(segment: Pt[], chordErrorM: number, profile: CentrelineDensifyProfile): Pt[] {
  if (segment.length < 2) return segment.slice();
  const out: Pt[] = [segment[0]!];
  for (let i = 0; i < segment.length - 1; i++) {
    const p1 = segment[i]!;
    const p2 = segment[i + 1]!;
    const edgeLen = dist(p1, p2);
    if (edgeLen < profile.minEdgeDensifyM) continue;
    const step = edgeDensifyStepM(edgeLen, chordErrorM);
    const steps = Math.min(profile.maxStepsPerEdge, Math.max(1, Math.ceil(edgeLen / step)));
    for (let s = 1; s <= steps; s++) {
      if (s === steps && i < segment.length - 2) continue;
      const t = s / steps;
      out.push([p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]);
    }
  }
  out[out.length - 1] = segment[segment.length - 1]!;
  return dedupeAdjacent(out);
}

function densifyCatmullSegment(segment: Pt[], chordErrorM: number, profile: CentrelineDensifyProfile): Pt[] {
  if (segment.length < 2) return segment.slice();
  const out: Pt[] = [segment[0]!];
  for (let i = 0; i < segment.length - 1; i++) {
    const p0 = segment[Math.max(0, i - 1)]!;
    const p1 = segment[i]!;
    const p2 = segment[i + 1]!;
    const p3 = segment[Math.min(segment.length - 1, i + 2)]!;
    const edgeLen = dist(p1, p2);
    if (edgeLen < profile.minEdgeDensifyM) continue;
    const step = edgeDensifyStepM(edgeLen, chordErrorM);
    const steps = Math.min(profile.maxStepsPerEdge, Math.max(2, Math.ceil(edgeLen / step)));
    for (let s = 1; s <= steps; s++) {
      if (s === steps && i < segment.length - 2) continue;
      const t = s / steps;
      out.push(catmullRomCentripetal(p0, p1, p2, p3, t));
    }
  }
  out[out.length - 1] = segment[segment.length - 1]!;
  return dedupeAdjacent(out);
}

function densifyCurvedSegment(segment: Pt[], chordErrorM: number, profile: CentrelineDensifyProfile): Pt[] {
  if (profile.catmullOnGentleRuns && segmentAllGentle(segment, CENTRELINE_SHARP_TURN_DEG)) {
    return densifyCatmullSegment(segment, chordErrorM, profile);
  }
  return densifyLinearSegment(segment, chordErrorM, profile);
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
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < line.length; i++) {
      const d = Math.hypot(line[i]![0] - junction[0], line[i]![1] - junction[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && bestD <= 0.05) pinned.add(best);
  }
  return [...pinned].sort((a, b) => a - b);
}

type WayVertex = { si: number; vi: number; pt: Pt };

/** Junction vertices shared by two or more centreline ways (endpoints or interior). */
export function junctionPointsFromStrips(strips: { line: Pt[] }[], snapM = CENTRELINE_JUNCTION_SNAP_M): Pt[] {
  const verts: WayVertex[] = [];
  for (let si = 0; si < strips.length; si++) {
    const line = strips[si]!.line;
    for (let vi = 0; vi < line.length; vi++) verts.push({ si, vi, pt: line[vi]! });
  }
  const cell = snapM > 0 ? snapM : 1;
  const buckets = new Map<string, WayVertex[]>();
  for (const v of verts) {
    const key = `${Math.floor(v.pt[0] / cell)},${Math.floor(v.pt[1] / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(v);
    else buckets.set(key, [v]);
  }
  const junctions: Pt[] = [];
  const seen = new Set<string>();
  for (const v of verts) {
    const gx = Math.floor(v.pt[0] / cell);
    const gy = Math.floor(v.pt[1] / cell);
    const group: WayVertex[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = buckets.get(`${gx + dx},${gy + dy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (pointsNear(v.pt, other.pt, snapM)) group.push(other);
        }
      }
    }
    const ways = new Set(group.map((g) => g.si));
    if (ways.size < 2) continue;
    const key = `${Math.round(v.pt[0] * 20) / 20},${Math.round(v.pt[1] * 20) / 20}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let x = 0;
    let y = 0;
    for (const g of group) {
      x += g.pt[0];
      y += g.pt[1];
    }
    junctions.push([x / group.length, y / group.length]);
  }
  return junctions;
}

function hasLongEdge(line: Pt[], minLenM: number): boolean {
  for (let i = 0; i < line.length - 1; i++) {
    if (dist(line[i]!, line[i + 1]!) >= minLenM) return true;
  }
  return false;
}

function hasGentleBend(line: Pt[], minLongEdgeM: number, minTurnDeg = 3): boolean {
  if (!hasLongEdge(line, minLongEdgeM)) return false;
  for (let i = 1; i < line.length - 1; i++) {
    if (turnDeflectionDeg(line[i - 1]!, line[i]!, line[i + 1]!) >= minTurnDeg) return true;
  }
  return hasLongEdge(line, minLongEdgeM);
}

function pinExactJunctionCoords(line: Pt[], junctionPoints: Pt[]): Pt[] {
  const out = line.map((p): Pt => [p[0], p[1]]);
  for (const junction of junctionPoints) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < out.length; i++) {
      const d = Math.hypot(out[i]![0] - junction[0], out[i]![1] - junction[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && bestD <= 0.05) out[best] = [junction[0], junction[1]];
  }
  if (out.length >= 1) {
    out[0] = [line[0]![0], line[0]![1]];
    out[out.length - 1] = [line[line.length - 1]![0], line[line.length - 1]![1]];
  }
  return out;
}

type SmoothOutcome = "no_bend" | "sharp_kink" | "too_few_pins" | "reverted_shift" | "smoothed";

/**
 * Densify curved centreline runs between pinned junction and corner vertices.
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
    chordErrorM?: number;
    profile?: CentrelineDensifyProfile;
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
    chordErrorM?: number;
    profile?: CentrelineDensifyProfile;
  } = {},
): { line: Pt[]; outcome: SmoothOutcome } {
  const profile = options.profile ?? ROAD_CENTRELINE_DENSIFY;
  const cacheKey = lineCacheKey(line, profile);
  const cached = centrelineCache.get(cacheKey);
  if (cached) return { line: cached.map((p): Pt => [p[0], p[1]]), outcome: "smoothed" };

  if (line.length < 3 || !hasGentleBend(line, profile.minLongEdgeM)) return { line: line.slice(), outcome: "no_bend" };
  const maxShift = options.maxLateralShiftM ?? profile.maxLateralShiftM;
  const junctionPoints = options.junctionPoints ?? [];
  const sharpTurnDeg = options.sharpTurnDeg ?? CENTRELINE_SHARP_TURN_DEG;
  const simplifyM = options.simplifyM ?? CENTRELINE_OUTPUT_SIMPLIFY_M;
  const chordErrorM = options.chordErrorM ?? CENTRELINE_CHORD_ERROR_M;
  const pins = pinnedVertexIndices(line, junctionPoints, sharpTurnDeg);
  if (pins.length < 2) return { line: line.slice(), outcome: "too_few_pins" };

  const densified: Pt[] = [];
  for (let pi = 0; pi < pins.length - 1; pi++) {
    const start = pins[pi]!;
    const end = pins[pi + 1]!;
    if (end <= start) continue;
    const segment = line.slice(start, end + 1);
    const part = densifyCurvedSegment(segment, chordErrorM, profile);
    if (pi === 0) densified.push(...part);
    else densified.push(...part.slice(1));
  }

  let withJunctions = pinExactJunctionCoords(densified.length >= 2 ? densified : line.slice(), junctionPoints);
  if (withJunctions.length >= 2) {
    withJunctions[0] = [line[0]![0], line[0]![1]];
    withJunctions[withJunctions.length - 1] = [line[line.length - 1]![0], line[line.length - 1]![1]];
  }

  if (maxLateralShift(line, withJunctions) > maxShift) return { line: line.slice(), outcome: "reverted_shift" };
  const simplified = simplifyM > 0 ? simplifyOpenPolyline(withJunctions, simplifyM) : withJunctions;
  if (simplified.length < line.length && maxLateralShift(line, simplified) > chordErrorM) {
    return { line: withJunctions, outcome: "smoothed" };
  }
  const finalLine = simplified.length >= 2 ? simplified : withJunctions;
  if (centrelineCache.size >= CENTRELINE_CACHE_LIMIT) {
    const first = centrelineCache.keys().next().value;
    if (first) centrelineCache.delete(first);
  }
  centrelineCache.set(cacheKey, finalLine.map((p): Pt => [p[0], p[1]]));
  return { line: finalLine, outcome: "smoothed" };
}

export function smoothCentrelineStrips<T extends { line: Pt[]; width: number }>(
  strips: T[],
  snapM = CENTRELINE_JUNCTION_SNAP_M,
  profile: CentrelineDensifyProfile = ROAD_CENTRELINE_DENSIFY,
  options: { simplifyM?: number; chordErrorM?: number } = {},
): T[] {
  if (strips.length === 0) return strips;
  const junctions = junctionPointsFromStrips(strips, snapM);
  const simplifyM = options.simplifyM ?? CENTRELINE_OUTPUT_SIMPLIFY_M;
  const chordErrorM = options.chordErrorM ?? CENTRELINE_CHORD_ERROR_M;
  return strips.map((strip) => ({
    ...strip,
    line: smoothCentreline(strip.line, { junctionPoints: junctions, simplifyM, chordErrorM, profile }),
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
    const { outcome } = smoothCentrelineDetailed(strip.line, { junctionPoints: junctions, simplifyM, profile: ROAD_CENTRELINE_DENSIFY });
    if (outcome === "no_bend") stats.skippedNoBend++;
    else if (outcome === "sharp_kink") stats.skippedSharpKink++;
    else if (outcome === "too_few_pins") stats.skippedTooFewPins++;
    else if (outcome === "reverted_shift") stats.revertedShift++;
    else stats.smoothed++;
  }
  return stats;
}
