import {
  ClipperOffset,
  EndType,
  JoinType,
  Path64,
  Paths64,
  PolyPath64,
  PolyTree64,
} from "clipper2-js";
import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";

/** Clipper2 integer scale: 1 mm per unit (0.001 m). */
export const CLIPPER_SCALE = 1000;

/** Round-join arc tolerance on the ground, in metres. */
export const CLIPPER_ARC_TOLERANCE_M = 0.05;

function toPath64(open: Ring): Path64 {
  const path = new Path64();
  for (const [x, y] of open) {
    path.push({ x: Math.round(x * CLIPPER_SCALE), y: Math.round(y * CLIPPER_SCALE) });
  }
  return path;
}

function fromPath64(path: Path64): Ring {
  const out: Ring = path.map((p) => [p.x / CLIPPER_SCALE, p.y / CLIPPER_SCALE]);
  if (out.length > 0) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  }
  return out;
}

/** One polygon (outer CCW + holes CW) as Clipper paths. */
function polygonToPaths64(polygon: Polygon): Paths64 {
  const paths = new Paths64();
  const outer = polygon[0];
  if (!outer || outer.length < 4) return paths;
  paths.push(toPath64(outer.slice(0, -1)));
  for (let i = 1; i < polygon.length; i++) {
    const hole = polygon[i];
    if (!hole || hole.length < 4) continue;
    paths.push(toPath64(hole.slice(0, -1).slice().reverse()));
  }
  return paths;
}

function polyPathToPolygon(node: PolyPath64): Polygon | null {
  if (!node.polygon || node.polygon.length < 3) return null;
  const shell = fromPath64(node.polygon);
  const holes: Ring[] = [];
  for (let i = 0; i < node.count; i++) {
    const child = node.child(i);
    if (!child.isHole || !child.polygon || child.polygon.length < 3) continue;
    holes.push(fromPath64(child.polygon));
  }
  return holes.length > 0 ? [shell, ...holes] : [shell];
}

function polyTreeToMultiPolygon(tree: PolyTree64): MultiPolygon {
  const out: MultiPolygon = [];
  for (let i = 0; i < tree.count; i++) {
    const poly = polyPathToPolygon(tree.child(i));
    if (poly) out.push(poly);
  }
  return out;
}

function multiPolygonToPaths64(polygons: MultiPolygon): Paths64 {
  const paths = new Paths64();
  for (const polygon of polygons) {
    const part = polygonToPaths64(polygon);
    for (let i = 0; i < part.length; i++) paths.push(part[i]!);
  }
  return paths;
}

function offsetPaths64(paths: Paths64, deltaM: number, fallback: MultiPolygon): MultiPolygon {
  if (paths.length === 0 || !(Math.abs(deltaM) > 1e-9)) return fallback;
  const delta = Math.round(deltaM * CLIPPER_SCALE);
  const arcTol = Math.max(1, Math.round(CLIPPER_ARC_TOLERANCE_M * CLIPPER_SCALE));
  const co = new ClipperOffset(2, arcTol);
  co.addPaths(paths, JoinType.Round, EndType.Polygon);
  const tree = new PolyTree64();
  co.executePolytree(delta, tree);
  const result = polyTreeToMultiPolygon(tree);
  return result.length > 0 ? result : fallback;
}

function offsetPolygonTree(polygon: Polygon, deltaM: number): MultiPolygon {
  const paths = polygonToPaths64(polygon);
  return offsetPaths64(paths, deltaM, [polygon]);
}

/** Offset every polygon in a multipolygon; round joins, arc tolerance 0.05 m. */
export function offsetMultiPolygon(polygons: MultiPolygon, deltaM: number): MultiPolygon {
  if (polygons.length === 0 || !(Math.abs(deltaM) > 1e-9)) return polygons;
  if (polygons.length === 1) return offsetPolygonTree(polygons[0]!, deltaM);
  return offsetPaths64(multiPolygonToPaths64(polygons), deltaM, polygons);
}

/** Closing: offset +r then −r (fills concave pockets, restores the outer footprint). */
export function offsetCloseMultiPolygon(polygons: MultiPolygon, radiusM: number): MultiPolygon {
  if (polygons.length === 0 || !(radiusM > 0)) return polygons;
  const expanded = offsetMultiPolygon(polygons, radiusM);
  return offsetMultiPolygon(expanded, -radiusM);
}
