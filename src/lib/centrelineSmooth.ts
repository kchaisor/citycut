import type { Pt } from "../types";

/** @deprecated Centreline densify/rounding removed; stubs for scripts and imports. */
export const CENTRELINE_SHARP_TURN_DEG = 70;
export const CENTRELINE_CHORD_ERROR_M = 0.05;
export const CENTRELINE_MAX_LATERAL_SHIFT_M = 0.5;
export const CENTRELINE_JUNCTION_SNAP_M = 1.75;
export const CENTRELINE_OUTPUT_SIMPLIFY_M = 0;
export const CENTRELINE_CHAIKIN_ITERATIONS = 0;

export type CentrelineDensifyProfile = {
  minEdgeDensifyM: number;
  maxStepsPerEdge: number;
  minLongEdgeM: number;
  maxLateralShiftM: number;
  cornerRoundRadiusM: number;
  cornerRoundMinDeg: number;
  cornerRoundMaxDeg: number;
  cornerRoundMaxEdgeFrac: number;
  cornerArcMaxStepDeg: number;
  preSimplifyM: number;
  postRoundSimplifyM: number;
};

export const ROAD_CENTRELINE_DENSIFY: CentrelineDensifyProfile = {
  minEdgeDensifyM: 4,
  maxStepsPerEdge: 4,
  minLongEdgeM: 4,
  maxLateralShiftM: 4.5,
  cornerRoundRadiusM: 0,
  cornerRoundMinDeg: 8,
  cornerRoundMaxDeg: 70,
  cornerRoundMaxEdgeFrac: 0.45,
  cornerArcMaxStepDeg: 5,
  preSimplifyM: 0,
  postRoundSimplifyM: 0,
};

export const FOOTPATH_CENTRELINE_DENSIFY: CentrelineDensifyProfile = ROAD_CENTRELINE_DENSIFY;

export function clearCentrelineCacheForTests(): void {}

type SmoothOutcome = "no_bend" | "sharp_kink" | "too_few_pins" | "reverted_shift" | "smoothed";

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

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
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

export function maxInteriorTurnDeg(line: Pt[], junctionPoints: Pt[] = [], sharpTurnDeg = CENTRELINE_SHARP_TURN_DEG): number {
  if (line.length < 3) return 0;
  const pins = new Set(pinnedVertexIndices(line, junctionPoints, sharpTurnDeg));
  let max = 0;
  for (let i = 1; i < line.length - 1; i++) {
    if (pins.has(i)) continue;
    max = Math.max(max, turnDeflectionDeg(line[i - 1]!, line[i]!, line[i + 1]!));
  }
  return max;
}

export function maxInteriorTurnDegInViewBox(
  line: Pt[],
  viewBox: string,
  junctionPoints: Pt[] = [],
  sharpTurnDeg = CENTRELINE_SHARP_TURN_DEG,
  minLegM = 1.5,
): number {
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  const eastMin = x!;
  const eastMax = x! + w!;
  const northMin = -(y! + h!);
  const northMax = -y!;
  const inBox = (p: Pt) => p[0] >= eastMin && p[0] <= eastMax && p[1] >= northMin && p[1] <= northMax;
  if (line.length < 3) return 0;
  const pins = new Set(pinnedVertexIndices(line, junctionPoints, sharpTurnDeg));
  let max = 0;
  for (let i = 1; i < line.length - 1; i++) {
    if (pins.has(i) || !inBox(line[i]!)) continue;
    const legIn = dist(line[i - 1]!, line[i]!);
    const legOut = dist(line[i]!, line[i + 1]!);
    if (legIn < minLegM || legOut < minLegM) continue;
    max = Math.max(max, turnDeflectionDeg(line[i - 1]!, line[i]!, line[i + 1]!));
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

/** Pass-through: geometry smoothing is handled in roadFill simplification tolerances. */
export function smoothCentreline(
  line: Pt[],
  _options: {
    junctionPoints?: Pt[];
    iterations?: number;
    maxLateralShiftM?: number;
    sharpTurnDeg?: number;
    simplifyM?: number;
    chordErrorM?: number;
    profile?: CentrelineDensifyProfile;
  } = {},
): Pt[] {
  return line.slice();
}

export function smoothCentrelineDetailed(
  line: Pt[],
  _options: {
    junctionPoints?: Pt[];
    iterations?: number;
    maxLateralShiftM?: number;
    sharpTurnDeg?: number;
    simplifyM?: number;
    chordErrorM?: number;
    profile?: CentrelineDensifyProfile;
  } = {},
): { line: Pt[]; outcome: SmoothOutcome } {
  return { line: line.slice(), outcome: "no_bend" };
}

export function smoothCentrelineStrips<T extends { line: Pt[]; width: number }>(
  strips: T[],
  _snapM = CENTRELINE_JUNCTION_SNAP_M,
  _profile: CentrelineDensifyProfile = ROAD_CENTRELINE_DENSIFY,
  _options: { simplifyM?: number; chordErrorM?: number } = {},
): T[] {
  return strips.map((strip) => ({ ...strip, line: strip.line.map((p): Pt => [p[0], p[1]]) }));
}

export function centrelineSmoothStats(
  strips: { line: Pt[] }[],
  _snapM = CENTRELINE_JUNCTION_SNAP_M,
  _options: { simplifyM?: number } = {},
): CentrelineSmoothStats {
  return {
    polylines: strips.length,
    skippedNoBend: strips.length,
    skippedSharpKink: 0,
    skippedTooFewPins: 0,
    smoothed: 0,
    revertedShift: 0,
  };
}
