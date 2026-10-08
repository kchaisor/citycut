import ClipperLib from "clipper-lib";
import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";
import { signedArea } from "./geo";

/** Clipper integer scale: 1 mm per unit (0.001 m). */
export const CLIPPER_SCALE = 1000;

/** Round-join arc tolerance on the ground, in metres. */
export const CLIPPER_ARC_TOLERANCE_M = 0.05;

type ClipperPoint = { X: number; Y: number };
type ClipperPath = ClipperPoint[];

function toClipperPath(open: Ring): ClipperPath {
  return open.map(([x, y]) => ({
    X: Math.round(x * CLIPPER_SCALE),
    Y: Math.round(y * CLIPPER_SCALE),
  }));
}

function fromClipperPath(path: ClipperPath): Ring {
  const out: Ring = path.map((p) => [p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE]);
  if (out.length > 0) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  }
  return out;
}

function openRing(ring: Ring): Ring {
  if (
    ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
  ) {
    return ring.slice(0, -1);
  }
  return ring;
}

function pointInRing(point: Ring[0], ring: Ring): boolean {
  const open = openRing(ring);
  let inside = false;
  for (let i = 0, j = open.length - 1; i < open.length; j = i++) {
    const xi = open[i]![0];
    const yi = open[i]![1];
    const xj = open[j]![0];
    const yj = open[j]![1];
    if (yi > point[1] !== yj > point[1]) {
      const xCross = ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
      if (point[0] < xCross) inside = !inside;
    }
  }
  return inside;
}

function ringCentroid(ring: Ring): Ring[0] {
  const open = openRing(ring);
  let x = 0;
  let y = 0;
  for (const p of open) {
    x += p[0];
    y += p[1];
  }
  const n = open.length || 1;
  return [x / n, y / n];
}

function ringAbsArea(ring: Ring): number {
  return Math.abs(signedArea(openRing(ring)));
}

/** Offset one closed ring; may split into multiple rings. */
function offsetSingleRing(open: Ring, deltaM: number, allowEmpty: boolean): Ring[] {
  if (open.length < 3 || !(Math.abs(deltaM) > 1e-9)) return [openRing(open).length >= 3 ? closeRing(open) : open];
  const delta = Math.round(deltaM * CLIPPER_SCALE);
  const arcTol = Math.max(1, CLIPPER_ARC_TOLERANCE_M * CLIPPER_SCALE);
  const co = new ClipperLib.ClipperOffset(2, arcTol);
  co.AddPath(toClipperPath(open), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const solution: ClipperLib.Paths = [];
  co.Execute(solution, delta);
  if (solution.length === 0) {
    if (allowEmpty) return [];
    throw new Error(`Clipper offset returned no paths (delta=${deltaM} m)`);
  }
  return solution.map(fromClipperPath);
}

function closeRing(open: Ring): Ring {
  const ring = openRing(open);
  if (ring.length === 0) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return ring as Ring;
  return [...ring, first];
}

/** Attach hole rings to the smallest containing shell. */
function assemblePolygons(shells: Ring[], holes: Ring[]): Polygon[] {
  const keptShells = shells.filter((ring) => ringAbsArea(ring) > 1e-6);
  const keptHoles = holes.filter((ring) => ringAbsArea(ring) > 1e-6);
  if (keptShells.length === 0) return [];

  const holeOwners = new Array<number | null>(keptHoles.length).fill(null);
  for (let hi = 0; hi < keptHoles.length; hi++) {
    const centroid = ringCentroid(keptHoles[hi]!);
    let best = -1;
    let bestArea = Infinity;
    for (let si = 0; si < keptShells.length; si++) {
      const area = ringAbsArea(keptShells[si]!);
      if (!pointInRing(centroid, keptShells[si]!)) continue;
      if (area < bestArea) {
        bestArea = area;
        best = si;
      }
    }
    holeOwners[hi] = best >= 0 ? best : null;
  }

  const grouped = keptShells.map((shell): Ring[] => [shell]);
  for (let hi = 0; hi < keptHoles.length; hi++) {
    const owner = holeOwners[hi];
    if (owner === null) continue;
    grouped[owner]!.push(keptHoles[hi]!);
  }

  return grouped.filter((polygon) => polygon[0] != null) as Polygon[];
}

/**
 * Offset a polygon with holes: expand the shell by delta and shrink holes by delta
 * so city-block holes are not lost to a flat-path union.
 */
function offsetPolygonWithHoles(polygon: Polygon, deltaM: number): Polygon[] {
  const outer = polygon[0];
  if (!outer || outer.length < 4) return [];
  const shells = offsetSingleRing(openRing(outer), deltaM, false);
  const holes: Ring[] = [];
  for (const hole of polygon.slice(1)) {
    if (!hole || hole.length < 4) continue;
    holes.push(...offsetSingleRing(openRing(hole), -deltaM, true));
  }
  return assemblePolygons(shells, holes);
}

/** Offset every polygon in a multipolygon; round joins, arc tolerance 0.05 m. */
export function offsetMultiPolygon(polygons: MultiPolygon, deltaM: number): MultiPolygon {
  if (polygons.length === 0 || !(Math.abs(deltaM) > 1e-9)) return polygons;
  const out: MultiPolygon = [];
  for (const polygon of polygons) {
    out.push(...offsetPolygonWithHoles(polygon, deltaM));
  }
  if (out.length === 0) {
    throw new Error(`Clipper offset produced no polygons (delta=${deltaM} m, inputs=${polygons.length})`);
  }
  return out;
}

/** Closing: offset +r then −r (fills concave pockets, restores the outer footprint). */
export function offsetCloseMultiPolygon(polygons: MultiPolygon, radiusM: number): MultiPolygon {
  if (polygons.length === 0 || !(radiusM > 0)) return polygons;
  const expanded = offsetMultiPolygon(polygons, radiusM);
  return offsetMultiPolygon(expanded, -radiusM);
}
