import { openRing } from "../geo";
import type { Pt, Ring } from "../../types";

const DECK_CHORD_M = 120;

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

function westDeckCap(ring: Pt[], chordAt: number): Pt[] | null {
  const a = ring[chordAt]!;
  const b = ring[chordAt + 1]!;
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= DECK_CHORD_M) return null;
  const westMidX = (a[0] + b[0]) / 2;
  const westPoints = ring.filter((p) => p[0] < westMidX);
  if (westPoints.length < 2) return null;
  const north = westPoints.reduce((pick, p) => (p[1] < pick[1] ? p : pick));
  const south = westPoints.reduce((pick, p) => (p[1] > pick[1] ? p : pick));
  if (Math.hypot(south[0] - north[0], south[1] - north[1]) > DECK_CHORD_M) return null;
  return [north, south];
}

export function deckPlanStrokePaths(ring: Ring): Pt[][] {
  const pts = openRing(ring);
  if (pts.length < 4) return [pts];
  const edgeLengths: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    edgeLengths.push(Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]));
  }
  const chordLimit = deckChordLimit(edgeLengths);
  const paths: Pt[][] = [];
  let run: Pt[] = [pts[0]!];
  let westChordAt = -1;
  let westChordX = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const next = pts[i + 1]!;
    const len = edgeLengths[i]!;
    if (len > chordLimit) {
      if (run.length >= 2) paths.push(run);
      run = [next];
      const midX = (pts[i]![0] + next[0]) / 2;
      if (midX < westChordX) {
        westChordX = midX;
        westChordAt = i;
      }
    } else {
      run.push(next);
    }
  }
  if (run.length >= 2) paths.push(run);
  if (westChordAt >= 0) {
    const cap = westDeckCap(pts, westChordAt);
    if (cap) paths.push(cap);
  }
  return paths.length > 0 ? paths : [pts];
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
