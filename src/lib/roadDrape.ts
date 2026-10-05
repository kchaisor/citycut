import type { Pt, TerrainField } from "../types";
import { polylineLength } from "./geo";

export type Tri = [Pt, Pt, Pt];

/** Extra height on a bridge deck between the tapered abutments. */
export const BRIDGE_DECK_CLEARANCE_M = 5;

/** Distance from each abutment over which clearance tapers to zero. */
export const BRIDGE_DECK_TAPER_M = 12;

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function triangleArea(tri: Tri): number {
  const [a, b, c] = tri;
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) * 0.5;
}

function interpolate(a: Pt, sa: number, b: Pt, sb: number): Pt {
  const denom = sa - sb;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : sa / denom;
  const u = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** Keep vertices on one side of `side(p) = 0` (Sutherland–Hodgman). */
function clipPoly(poly: Pt[], side: (point: Pt) => number, keepNonNegative: boolean): Pt[] {
  if (poly.length < 3) return [];
  const out: Pt[] = [];
  const inside = (value: number) => (keepNonNegative ? value >= -1e-8 : value <= 1e-8);
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const sc = side(cur);
    const sp = side(prev);
    const curIn = inside(sc);
    const prevIn = inside(sp);
    if (curIn) {
      if (!prevIn) out.push(interpolate(prev, sp, cur, sc));
      out.push(cur);
    } else if (prevIn) {
      out.push(interpolate(prev, sp, cur, sc));
    }
  }
  return out;
}

function fan(poly: Pt[]): Tri[] {
  if (poly.length < 3) return [];
  const tris: Tri[] = [];
  for (let i = 1; i + 1 < poly.length; i++) {
    const tri: Tri = [poly[0], poly[i], poly[i + 1]];
    if (triangleArea(tri) > 1e-8) tris.push(tri);
  }
  return tris;
}

/** Split a plan triangle by the line `side(p) = 0`. */
export function splitTriByLine(tri: Tri, side: (point: Pt) => number): Tri[] {
  const poly = [tri[0], tri[1], tri[2]];
  const left = fan(clipPoly(poly, side, true));
  const right = fan(clipPoly(poly, side, false));
  if (left.length === 0) return right.length > 0 ? right : [tri];
  if (right.length === 0) return left;
  return [...left, ...right];
}

function splitOnceOnGrid(tri: Tri, field: TerrainField, sideM: number): Tri[] {
  const minE = Math.min(tri[0][0], tri[1][0], tri[2][0]);
  const maxE = Math.max(tri[0][0], tri[1][0], tri[2][0]);
  const minN = Math.min(tri[0][1], tri[1][1], tri[2][1]);
  const maxN = Math.max(tri[0][1], tri[1][1], tri[2][1]);
  const half = sideM / 2;
  const slop = 1e-4;
  const col0 = Math.floor((minE + half) / field.spacingM);
  const col1 = Math.floor((maxE + half - 1e-9) / field.spacingM);
  const row0 = Math.floor((minN + half) / field.spacingM);
  const row1 = Math.floor((maxN + half - 1e-9) / field.spacingM);

  for (let col = Math.max(1, col0 + 1); col <= col1 && col <= field.cols - 1; col++) {
    const east = -half + col * field.spacingM;
    if (east > minE + slop && east < maxE - slop) {
      const parts = splitTriByLine(tri, (point) => point[0] - east);
      if (parts.length > 1) return parts;
    }
  }
  for (let row = Math.max(1, row0 + 1); row <= row1 && row <= field.rows - 1; row++) {
    const north = -half + row * field.spacingM;
    if (north > minN + slop && north < maxN - slop) {
      const parts = splitTriByLine(tri, (point) => point[1] - north);
      if (parts.length > 1) return parts;
    }
  }

  if (
    col0 === col1 &&
    row0 === row1 &&
    col0 >= 0 &&
    row0 >= 0 &&
    col0 < field.cols - 1 &&
    row0 < field.rows - 1
  ) {
    const swE = -half + col0 * field.spacingM;
    const swN = -half + row0 * field.spacingM;
    const sides = tri.map((point) => point[0] - swE - (point[1] - swN));
    const pos = sides.some((value) => value > slop);
    const neg = sides.some((value) => value < -slop);
    if (pos && neg) {
      const parts = splitTriByLine(tri, (point) => point[0] - swE - (point[1] - swN));
      if (parts.length > 1) return parts;
    }
  }

  return [tri];
}

/**
 * Split road triangles so each one sits in a single terrain-mesh triangle
 * (grid cell + SW–NE diagonal). Vertices land on grid lines and diagonals
 * where an edge crossed them; heights then stay coplanar with the mesh.
 */
export function constrainTrisToTerrainGrid(tris: Tri[], field: TerrainField, sideM: number): Tri[] {
  if (field.cols < 2 || field.rows < 2) return tris;
  let current = tris;
  for (let pass = 0; pass < 24; pass++) {
    const next: Tri[] = [];
    let splitAny = false;
    for (const tri of current) {
      const parts = splitOnceOnGrid(tri, field, sideM);
      if (parts.length > 1) splitAny = true;
      next.push(...parts);
    }
    current = next;
    if (!splitAny) break;
  }
  return current;
}

/** Normalised distance along `line` of the closest point to `point`. */
export function closestParameter(line: Pt[], point: Pt): number {
  const total = polylineLength(line);
  if (total < 1e-9) return 0;
  let bestDist = Infinity;
  let bestAlong = 0;
  let walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (len * len)));
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    const dist = Math.hypot(point[0] - px, point[1] - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestAlong = walked + t * len;
    }
    walked += len;
  }
  return bestAlong / total;
}

/**
 * Planar ramp between the abutment ground heights, plus clearance that
 * tapers to zero at each end so the deck meets the draped road.
 */
export function deckHeightAt(
  line: Pt[],
  sample: (east: number, north: number) => number,
  east: number,
  north: number,
  clearance = BRIDGE_DECK_CLEARANCE_M,
  taperM = BRIDGE_DECK_TAPER_M,
): number {
  const t = closestParameter(line, [east, north]);
  const start = line[0];
  const end = line[line.length - 1];
  const z0 = sample(start[0], start[1]);
  const z1 = sample(end[0], end[1]);
  const base = z0 + t * (z1 - z0);
  const total = polylineLength(line);
  const taper = total < 1e-3 ? 0.5 : Math.min(0.45, taperM / total);
  let extra = clearance;
  if (taper > 0 && t < taper) extra = clearance * (t / taper);
  else if (taper > 0 && t > 1 - taper) extra = clearance * ((1 - t) / taper);
  return base + extra;
}
