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
    if (triangleArea(tri) > 1e-4) tris.push(tri);
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

function clipAgainstEdge(poly: Pt[], a: Pt, b: Pt): Pt[] {
  return clipPoly(poly, (point) => (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]), true);
}

function clipConvex(tri: Tri, clip: Pt[]): Pt[] {
  let poly = [tri[0], tri[1], tri[2]];
  for (let i = 0; i < clip.length; i++) {
    poly = clipAgainstEdge(poly, clip[i], clip[(i + 1) % clip.length]);
    if (poly.length < 3) return [];
  }
  return poly;
}

function overlappingCells(tri: Tri, field: TerrainField, sideM: number): Array<{ c0: number; r0: number }> {
  const half = sideM / 2;
  const minE = Math.min(tri[0][0], tri[1][0], tri[2][0]);
  const maxE = Math.max(tri[0][0], tri[1][0], tri[2][0]);
  const minN = Math.min(tri[0][1], tri[1][1], tri[2][1]);
  const maxN = Math.max(tri[0][1], tri[1][1], tri[2][1]);
  const col0 = Math.max(0, Math.min(field.cols - 2, Math.floor((minE + half) / field.spacingM)));
  const col1 = Math.max(0, Math.min(field.cols - 2, Math.floor((maxE + half - 1e-9) / field.spacingM)));
  const row0 = Math.max(0, Math.min(field.rows - 2, Math.floor((minN + half) / field.spacingM)));
  const row1 = Math.max(0, Math.min(field.rows - 2, Math.floor((maxN + half - 1e-9) / field.spacingM)));
  const cells: Array<{ c0: number; r0: number }> = [];
  for (let r0 = row0; r0 <= row1; r0++) {
    for (let c0 = col0; c0 <= col1; c0++) cells.push({ c0, r0 });
  }
  return cells;
}

function constrainOne(tri: Tri, field: TerrainField, sideM: number): Tri[] {
  if (triangleArea(tri) < 1e-4) return [];
  const cells = overlappingCells(tri, field, sideM);
  if (cells.length === 0) return [tri];
  const half = sideM / 2;
  const spacing = field.spacingM;
  if (cells.length === 1) {
    const { c0, r0 } = cells[0];
    const sw: Pt = [-half + c0 * spacing, -half + r0 * spacing];
    const sides = tri.map((point) => point[0] - sw[0] - (point[1] - sw[1]));
    const pos = sides.some((value) => value > 1e-4);
    const neg = sides.some((value) => value < -1e-4);
    if (!pos || !neg) return [tri];
  }
  const out: Tri[] = [];
  for (const { c0, r0 } of cells) {
    const sw: Pt = [-half + c0 * spacing, -half + r0 * spacing];
    const se: Pt = [sw[0] + spacing, sw[1]];
    const ne: Pt = [sw[0] + spacing, sw[1] + spacing];
    const nw: Pt = [sw[0], sw[1] + spacing];
    out.push(...fan(clipConvex(tri, [sw, se, ne])));
    out.push(...fan(clipConvex(tri, [sw, ne, nw])));
  }
  return out.length > 0 ? out : [tri];
}

/**
 * Split road triangles so each one sits in a single terrain-mesh triangle
 * (grid cell + SW–NE diagonal). Vertices land on grid lines and diagonals
 * where an edge crossed them; heights then stay coplanar with the mesh.
 */
export function constrainTrisToTerrainGrid(tris: Tri[], field: TerrainField, sideM: number): Tri[] {
  if (field.cols < 2 || field.rows < 2) return tris;
  const out: Tri[] = [];
  for (const tri of tris) out.push(...constrainOne(tri, field, sideM));
  return out;
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
