import { openRing } from "../geo";
import { pointInPolygon } from "../useCascade";
import type { Pt, Ring } from "../../types";

const DECK_CHORD_M = 120;
const DECK_ABUTMENT_MAX_M = 95;
const DECK_END_BAND_RATIO = 0.22;
const DECK_INTERIOR_TOL_M = 0.5;
const RING_VERTEX_TOL_M = 0.12;

export type DeckPlanStrokeKind = "rail" | "cap";

export type DeckPlanStroke = {
  kind: DeckPlanStrokeKind;
  line: Pt[];
};

export function orderDeckBoundaryRing(ring: Ring): Ring {
  const pts = openRing(ring);
  if (pts.length < 4) return ring;
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[start]!;
    const b = pts[i]!;
    if (b[0] < a[0] - 0.01 || (Math.abs(b[0] - a[0]) <= 0.01 && b[1] < a[1])) start = i;
  }
  const ordered: Pt[] = [pts[start]!];
  const used = new Set<number>([start]);
  let current = start;
  while (used.size < pts.length) {
    let pick = -1;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (used.has(i)) continue;
      const d = Math.hypot(pts[i]![0] - pts[current]![0], pts[i]![1] - pts[current]![1]);
      if (d < best) {
        best = d;
        pick = i;
      }
    }
    if (pick < 0) break;
    ordered.push(pts[pick]!);
    used.add(pick);
    current = pick;
  }
  if (ordered.length < 3) return ring;
  const [fx, fy] = ordered[0]!;
  const [lx, ly] = ordered[ordered.length - 1]!;
  if (Math.hypot(fx - lx, fy - ly) > 0.05) ordered.push([fx, fy]);
  return ordered;
}

function deckChordLimit(edgeLengths: number[]): number {
  const short = edgeLengths.filter((len) => len < DECK_CHORD_M);
  if (short.length === 0) return DECK_CHORD_M;
  const sorted = [...short].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return Math.max(DECK_CHORD_M, median * 3);
}

function pointsNear(a: Pt, b: Pt, tol = RING_VERTEX_TOL_M): boolean {
  return Math.hypot(b[0] - a[0], b[1] - a[1]) <= tol;
}

function ringVertexIndex(p: Pt, ring: Ring, tol = RING_VERTEX_TOL_M): number | null {
  const pts = openRing(ring);
  for (let i = 0; i < pts.length; i++) {
    if (pointsNear(p, pts[i]!, tol)) return i;
  }
  return null;
}

export function distToRingBoundary(p: Pt, ring: Ring): number {
  const pts = openRing(ring);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) {
      best = Math.min(best, Math.hypot(p[0] - a[0], p[1] - a[1]));
      continue;
    }
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const qx = a[0] + dx * t;
    const qy = a[1] + dy * t;
    best = Math.min(best, Math.hypot(p[0] - qx, p[1] - qy));
  }
  return best;
}

export function deckStrokeMidpointInteriorM(a: Pt, b: Pt, ring: Ring): number {
  const holes: Ring[] = [];
  let worst = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (!pointInPolygon(p, ring, holes)) continue;
    worst = Math.max(worst, distToRingBoundary(p, ring));
  }
  return worst;
}

export function isConsecutiveRingEdge(a: Pt, b: Pt, ring: Ring, tol = RING_VERTEX_TOL_M): boolean {
  const ia = ringVertexIndex(a, ring, tol);
  const ib = ringVertexIndex(b, ring, tol);
  if (ia === null || ib === null) return false;
  const pts = openRing(ring);
  const last = pts.length - 1;
  if (Math.abs(ia - ib) === 1) return true;
  if (ia === 0 && ib === last) return true;
  if (ib === 0 && ia === last) return true;
  return false;
}

export function isDeckBoundaryRailSegment(a: Pt, b: Pt, ring: Ring): boolean {
  if (!isConsecutiveRingEdge(a, b, ring)) return false;
  return deckStrokeMidpointInteriorM(a, b, ring) <= DECK_INTERIOR_TOL_M;
}

function deckExtentX(paths: Pt[][]): { minX: number; maxX: number; width: number } {
  const xs = paths.flat().map((p) => p[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return { minX, maxX, width: Math.max(maxX - minX, 1) };
}

function abutmentBand(extent: { minX: number; maxX: number; width: number }) {
  return {
    west: extent.minX + extent.width * DECK_END_BAND_RATIO,
    east: extent.maxX - extent.width * DECK_END_BAND_RATIO,
  };
}

export function isDeckEndCapSegment(a: Pt, b: Pt, paths: Pt[][]): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.5 || len > DECK_ABUTMENT_MAX_M) return false;
  const extent = deckExtentX(paths);
  const band = abutmentBand(extent);
  const midX = (a[0] + b[0]) / 2;
  const transverse = Math.abs(b[0] - a[0]) > 6 && Math.abs(b[1] - a[1]) > 6;
  if (!transverse) return false;
  const atWest = a[0] <= band.west && b[0] <= band.west && midX <= band.west;
  const atEast = a[0] >= band.east && b[0] >= band.east && midX >= band.east;
  return atWest || atEast;
}

function peelBandCapSegment(a: Pt, b: Pt, paths: Pt[][]): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.5 || len > DECK_ABUTMENT_MAX_M || len <= 20) return false;
  const extent = deckExtentX(paths);
  const band = abutmentBand(extent);
  const midX = (a[0] + b[0]) / 2;
  const atWest = a[0] <= band.west && b[0] <= band.west && midX <= band.west;
  const atEast = a[0] >= band.east && b[0] >= band.east && midX >= band.east;
  return atWest || atEast;
}

type BoundaryEdge = { a: Pt; b: Pt; index: number };

function chainBoundaryEdges(edges: BoundaryEdge[]): Pt[][] {
  if (edges.length === 0) return [];
  const sorted = [...edges].sort((x, y) => x.index - y.index);
  const chains: Pt[][] = [];
  let chain: Pt[] = [sorted[0]!.a, sorted[0]!.b];
  for (let k = 1; k < sorted.length; k++) {
    const e = sorted[k]!;
    const prev = sorted[k - 1]!;
  if (e.index === prev.index + 1 && pointsNear(e.a, prev.b)) {
      chain.push(e.b);
    } else {
      if (chain.length >= 2) chains.push(chain);
      chain = [e.a, e.b];
    }
  }
  if (chain.length >= 2) chains.push(chain);
  return chains;
}

function capSegmentKey(line: Pt[]): string {
  const a = line[0]!;
  const b = line[1]!;
  const keys = [
    `${a[0].toFixed(2)},${a[1].toFixed(2)}`,
    `${b[0].toFixed(2)},${b[1].toFixed(2)}`,
  ].sort();
  return keys.join("|");
}

function classifyRingEdge(a: Pt, b: Pt, ring: Ring, chordLimit: number, paths: Pt[][]): DeckPlanStrokeKind | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len > chordLimit) return null;
  if (isDeckEndCapSegment(a, b, paths) || peelBandCapSegment(a, b, paths)) return "cap";
  if (!isConsecutiveRingEdge(a, b, ring)) return null;
  if (deckStrokeMidpointInteriorM(a, b, ring) > DECK_INTERIOR_TOL_M) return null;
  return "rail";
}

export function deckPlanStrokePaths(ring: Ring): DeckPlanStroke[] {
  const pts = openRing(ring);
  if (pts.length < 4) return [{ kind: "rail", line: pts }];
  const edgeLengths: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    edgeLengths.push(Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]));
  }
  const chordLimit = deckChordLimit(edgeLengths);
  const pathsCtx: Pt[][] = [pts];
  const railEdges: BoundaryEdge[] = [];
  const capLines: Pt[][] = [];
  const capKeys = new Set<string>();
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const kind = classifyRingEdge(a, b, ring, chordLimit, pathsCtx);
    if (!kind) continue;
    if (kind === "rail") railEdges.push({ a, b, index: i });
    if (kind === "cap") {
      const line = [a, b] as Pt[];
      const key = capSegmentKey(line);
      if (!capKeys.has(key)) {
        capKeys.add(key);
        capLines.push(line);
      }
    }
  }
  const rails = chainBoundaryEdges(railEdges);
  const strokes: DeckPlanStroke[] = [];
  for (const line of rails) {
    if (line.length >= 2) strokes.push({ kind: "rail", line });
  }
  for (const line of capLines) strokes.push({ kind: "cap", line });
  return strokes.length > 0 ? strokes : [{ kind: "rail", line: pts }];
}

function deckFillRingFromPaths(paths: Pt[][]): Pt[] {
  if (paths.length < 2) return paths[0] ?? [];
  const outer = [...paths[0]!];
  const inner = [...paths[1]!].reverse();
  return [...outer, ...inner];
}

function distToSegments(p: Pt, paths: Pt[][], tol: number): number {
  let best = Infinity;
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      const qx = a[0] + dx * t;
      const qy = a[1] + dy * t;
      best = Math.min(best, Math.hypot(p[0] - qx, p[1] - qy));
    }
  }
  return best <= tol ? 0 : best;
}

export function deckStrokeSegmentInsideDeck(
  a: Pt,
  b: Pt,
  _ring: Ring,
  paths: Pt[][],
  toleranceM = 2.5,
): boolean {
  const fill = deckFillRingFromPaths(paths);
  if (fill.length < 4) return true;
  for (const t of [0.25, 0.5, 0.75]) {
    const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (pointInPolygon(p, fill, [])) continue;
    if (distToSegments(p, paths, toleranceM) > toleranceM) return false;
  }
  const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (span > DECK_CHORD_M) return false;
  return true;
}

export function ringChordCount(ring: Ring): number {
  const pts = openRing(ring);
  if (pts.length < 4) return 0;
  let hits = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    for (let j = i + 2; j < pts.length - 1; j++) {
      if (i === 0 && j === pts.length - 2) continue;
      const c = pts[j]!;
      const d = pts[j + 1]!;
      const det = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]);
      if (Math.abs(det) < 1e-12) continue;
      const u = ((c[0] - a[0]) * (a[1] - b[1]) - (c[1] - a[1]) * (a[0] - b[0])) / det;
      const v = ((d[0] - a[0]) * (a[1] - b[1]) - (d[1] - a[1]) * (a[0] - b[0])) / det;
      if (u > 0.02 && u < 0.98 && v > 0.02 && v < 0.98) hits++;
    }
  }
  return hits;
}
