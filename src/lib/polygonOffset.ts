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

function clipperPathsToMultiPolygon(paths: ClipperLib.Paths): MultiPolygon {
  type Tagged = { ring: Ring; area: number; holeOf: number | null };
  const tagged: Tagged[] = [];
  for (const path of paths) {
    if (!path || path.length < 3) continue;
    const ring = fromClipperPath(path);
    const open = openRing(ring);
    if (open.length < 3) continue;
    tagged.push({ ring, area: signedArea(open), holeOf: null });
  }
  for (let i = 0; i < tagged.length; i++) {
    const ci = ringCentroid(tagged[i]!.ring);
    let parent = -1;
    let parentAbs = Infinity;
    for (let j = 0; j < tagged.length; j++) {
      if (i === j) continue;
      const absJ = Math.abs(tagged[j]!.area);
      if (absJ <= Math.abs(tagged[i]!.area)) continue;
      if (!pointInRing(ci, tagged[j]!.ring)) continue;
      if (absJ < parentAbs) {
        parentAbs = absJ;
        parent = j;
      }
    }
    if (parent >= 0) tagged[i]!.holeOf = parent;
  }
  const out: MultiPolygon = [];
  for (let i = 0; i < tagged.length; i++) {
    if (tagged[i]!.holeOf !== null) continue;
    const holes: Ring[] = [];
    for (let j = 0; j < tagged.length; j++) {
      if (tagged[j]!.holeOf === i) holes.push(tagged[j]!.ring);
    }
    out.push(holes.length > 0 ? [tagged[i]!.ring, ...holes] : [tagged[i]!.ring]);
  }
  return out;
}

/** One polygon (outer + holes) as Clipper paths. */
function polygonToClipperPaths(polygon: Polygon): ClipperLib.Paths {
  const paths: ClipperLib.Paths = [];
  const outer = polygon[0];
  if (!outer || outer.length < 4) return paths;
  paths.push(toClipperPath(outer.slice(0, -1)));
  for (let i = 1; i < polygon.length; i++) {
    const hole = polygon[i];
    if (!hole || hole.length < 4) continue;
    paths.push(toClipperPath(hole.slice(0, -1).slice().reverse()));
  }
  return paths;
}

function multiPolygonToClipperPaths(polygons: MultiPolygon): ClipperLib.Paths {
  const paths: ClipperLib.Paths = [];
  for (const polygon of polygons) {
    const part = polygonToClipperPaths(polygon);
    for (const p of part) paths.push(p);
  }
  return paths;
}

function offsetClipperPaths(paths: ClipperLib.Paths, deltaM: number): MultiPolygon {
  if (paths.length === 0 || !(Math.abs(deltaM) > 1e-9)) return [];
  const delta = Math.round(deltaM * CLIPPER_SCALE);
  const arcTol = Math.max(1, CLIPPER_ARC_TOLERANCE_M * CLIPPER_SCALE);
  const co = new ClipperLib.ClipperOffset(2, arcTol);
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const solution: ClipperLib.Paths = [];
  co.Execute(solution, delta);
  if (solution.length === 0) {
    throw new Error(`Clipper offset returned no paths (delta=${deltaM} m, inputs=${paths.length})`);
  }
  return clipperPathsToMultiPolygon(solution);
}

function offsetPolygonTree(polygon: Polygon, deltaM: number): MultiPolygon {
  const paths = polygonToClipperPaths(polygon);
  const result = offsetClipperPaths(paths, deltaM);
  return result.length > 0 ? result : [polygon];
}

/** Offset every polygon in a multipolygon; round joins, arc tolerance 0.05 m. */
export function offsetMultiPolygon(polygons: MultiPolygon, deltaM: number): MultiPolygon {
  if (polygons.length === 0 || !(Math.abs(deltaM) > 1e-9)) return polygons;
  if (polygons.length === 1) return offsetPolygonTree(polygons[0]!, deltaM);
  return offsetClipperPaths(multiPolygonToClipperPaths(polygons), deltaM);
}

/** Closing: offset +r then −r (fills concave pockets, restores the outer footprint). */
export function offsetCloseMultiPolygon(polygons: MultiPolygon, radiusM: number): MultiPolygon {
  if (polygons.length === 0 || !(radiusM > 0)) return polygons;
  const expanded = offsetMultiPolygon(polygons, radiusM);
  return offsetMultiPolygon(expanded, -radiusM);
}
