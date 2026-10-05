import type { Pt } from "../types";

export type Tri = [Pt, Pt, Pt];

/** Minimum clearance for bridge decks above the highest ground sample under the deck. */
export const BRIDGE_DECK_CLEARANCE_M = 4.5;

/** Max triangle count while densifying a draped fill (roads/path/rail). */
export const ROAD_DRAPE_TRIANGLE_BUDGET = 48_000;

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function midpoint(a: Pt, b: Pt): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function trianglesFromShapePositions(positions: Float32Array, indices: Uint16Array | Uint32Array | null): Tri[] {
  const at = (vertex: number): Pt => [positions[vertex * 3], positions[vertex * 3 + 1]];
  const tris: Tri[] = [];
  if (indices) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      tris.push([at(indices[i]), at(indices[i + 1]), at(indices[i + 2])]);
    }
  } else {
    const count = positions.length / 3;
    for (let i = 0; i + 2 < count; i += 3) tris.push([at(i), at(i + 1), at(i + 2)]);
  }
  return tris;
}

export function splitTriangle(tri: Tri, maxEdge: number): Tri[] {
  const [a, b, c] = tri;
  const ab = distance(a, b) > maxEdge;
  const bc = distance(b, c) > maxEdge;
  const ca = distance(c, a) > maxEdge;
  const count = Number(ab) + Number(bc) + Number(ca);
  if (count === 0) return [tri];
  const mab = midpoint(a, b);
  const mbc = midpoint(b, c);
  const mca = midpoint(c, a);
  if (count === 3) return [[a, mab, mca], [mab, b, mbc], [mca, mbc, c], [mab, mbc, mca]];
  if (count === 1) {
    if (ab) return [[a, mab, c], [mab, b, c]];
    if (bc) return [[a, b, mbc], [a, mbc, c]];
    return [[a, b, mca], [mca, b, c]];
  }
  if (!ab) return [[a, b, mbc], [a, mbc, mca], [mca, mbc, c]];
  if (!bc) return [[a, mab, mca], [mab, b, c], [mab, c, mca]];
  return [[a, mab, c], [mab, mbc, c], [mab, b, mbc]];
}

function needsSplit(tri: Tri, maxEdge: number): boolean {
  const [a, b, c] = tri;
  return distance(a, b) > maxEdge || distance(b, c) > maxEdge || distance(c, a) > maxEdge;
}

/** Longest edge in a triangle list (plan metres). */
export function maxTriangleEdge(tris: Tri[]): number {
  let max = 0;
  for (const [a, b, c] of tris) {
    max = Math.max(max, distance(a, b), distance(b, c), distance(c, a));
  }
  return max;
}

/**
 * Refine a 2D triangulation until every edge is at most `maxEdge`.
 * Only splits triangles that still exceed the spacing (avoids the old global
 * refinement that hit the triangle budget while long chords remained).
 */
export function subdivideToSpacing(
  tris: Tri[],
  maxEdge: number,
  maxCount = ROAD_DRAPE_TRIANGLE_BUDGET,
  coarsenAttempts = 0,
): Tri[] {
  let current = tris;
  for (let level = 0; level < 14; level++) {
    let splits = 0;
    const next: Tri[] = [];
    for (const tri of current) {
      if (needsSplit(tri, maxEdge)) {
        next.push(...splitTriangle(tri, maxEdge));
        splits += 1;
      } else next.push(tri);
    }
    if (splits === 0) return current;
    if (next.length > maxCount) {
      if (coarsenAttempts >= 2 || maxEdge >= 10) return current;
      return subdivideToSpacing(tris, maxEdge * 1.35, maxCount, coarsenAttempts + 1);
    }
    current = next;
  }
  return current;
}

