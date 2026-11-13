import { openRing } from "../geo";
import { pointInPolygon } from "../useCascade";
import type { Pt, Ring } from "../../types";

const DECK_CHORD_M = 120;

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

function polylineLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    len += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  }
  return len;
}

function splitDeckRingAtBowties(pts: Pt[]): Pt[][] {
  const edgeLengths: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    edgeLengths.push(Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]));
  }
  const chordLimit = deckChordLimit(edgeLengths);
  const chains: Pt[][] = [];
  let run: Pt[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const next = pts[i + 1]!;
    if (edgeLengths[i]! > chordLimit) {
      if (run.length >= 2) chains.push(run);
      run = [next];
    } else {
      run.push(next);
    }
  }
  if (run.length >= 2) chains.push(run);
  return chains;
}

function mergeShortEastSpur(chains: Pt[][]): Pt[][] {
  if (chains.length <= 2) return chains;
  const ranked = chains
    .map((chain, index) => ({ chain, index, len: polylineLength(chain) }))
    .sort((a, b) => b.len - a.len);
  const keep = ranked.slice(0, 2);
  const drop = ranked.slice(2);
  const rails = keep.map((row) => [...row.chain]);
  for (const spur of drop) {
    let bestRail = 0;
    let bestDist = Infinity;
    for (const end of [spur.chain[0]!, spur.chain[spur.chain.length - 1]!]) {
      for (let r = 0; r < rails.length; r++) {
        const rail = rails[r]!;
        for (const tip of [rail[0]!, rail[rail.length - 1]!]) {
          const d = Math.hypot(end[0] - tip[0], end[1] - tip[1]);
          if (d < bestDist) {
            bestDist = d;
            bestRail = r;
          }
        }
      }
    }
    if (bestDist < 80) {
      const rail = rails[bestRail]!;
      const a = spur.chain[0]!;
      const d0 = Math.hypot(a[0] - rail[0]![0], a[1] - rail[0]![1]);
      const d1 = Math.hypot(a[0] - rail[rail.length - 1]![0], a[1] - rail[rail.length - 1]![1]);
      if (d0 < d1) rails[bestRail] = [...spur.chain, ...rail];
      else rails[bestRail] = [...rail, ...spur.chain];
    }
  }
  return rails;
}

function westAbutmentCap(railA: Pt[], railB: Pt[]): Pt[] | null {
  const westA = railA.reduce((pick, p) => (p[0] < pick[0] ? p : pick));
  const westB = railB.reduce((pick, p) => (p[0] < pick[0] ? p : pick));
  const dist = Math.hypot(westB[0] - westA[0], westB[1] - westA[1]);
  if (dist < 0.5 || dist > 90) return null;
  return [westA, westB];
}

export function deckPlanStrokePaths(ring: Ring): DeckPlanStroke[] {
  const pts = openRing(ring);
  if (pts.length < 4) return [{ kind: "rail", line: pts }];
  const chains = mergeShortEastSpur(splitDeckRingAtBowties(pts));
  const ranked = chains.sort((a, b) => polylineLength(b) - polylineLength(a));
  const railA = ranked[0] ?? [];
  const railB = ranked[1] ?? [];
  const strokes: DeckPlanStroke[] = [];
  if (railA.length >= 2) strokes.push({ kind: "rail", line: railA });
  if (railB.length >= 2) strokes.push({ kind: "rail", line: railB });
  const cap = railA.length >= 2 && railB.length >= 2 ? westAbutmentCap(railA, railB) : null;
  if (cap) strokes.push({ kind: "cap", line: cap });
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
