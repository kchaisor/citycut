import * as THREE from "three";
import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { carriagewaysOf, unionCarriageways, unionPathRoads } from "./roadFill";
import { DEFAULT_SITE_FRAME_SHAPE, siteFramePolygon } from "./siteFrame";
import { clipTrianglesToTerrainGrid, terrainMeshHeight, type Tri } from "./terrainDrape";
import type { CityModel, Pt, RoadGrade, TerrainField } from "../types";

/**
 * The ground split into two draped surfaces that tile the cut exactly:
 *   Ground::Roads     = every road and path fill (arterial > local > path, made disjoint)
 *   Ground::Remaining = the cut minus the roads
 * Building footprints are NOT cut out; water and parks stay as their own overlays on top.
 * Both surfaces are triangulated from the same polygon boundary and cut on the same terrain grid,
 * so they share every edge vertex and leave no cracks.
 */

export const GROUND_ROADS_LAYER = "Ground::Roads";
export const GROUND_REMAINING_LAYER = "Ground::Remaining";
export const ROAD_GRADES_BY_PRIORITY: RoadGrade[] = ["arterial", "local", "path"];

type Clip = {
  union: (...g: (Polygon | MultiPolygon)[]) => MultiPolygon;
  difference: (a: Polygon | MultiPolygon, ...b: (Polygon | MultiPolygon)[]) => MultiPolygon;
};
function clip(): Clip {
  const loaded = polygonClipping as unknown as Clip & { default?: Clip };
  return typeof loaded.union === "function" ? loaded : loaded.default!;
}

export type GroundRoadPartition = {
  /** Disjoint road fill per grade, inside the cut. */
  roads: Record<RoadGrade, MultiPolygon>;
  remaining: MultiPolygon;
  frame: Polygon;
};

export function groundRoadPartition(model: Pick<CityModel, "roads" | "sideM" | "frameShape">): GroundRoadPartition {
  const { union, difference } = clip();
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const frame = siteFramePolygon(model.sideM, frameShape) as Polygon;
  const raw: Record<RoadGrade, MultiPolygon> = {
    arterial: unionCarriageways(carriagewaysOf(model.roads.filter((r) => r.grade === "arterial")), model.sideM, frameShape).polygons,
    local: unionCarriageways(carriagewaysOf(model.roads.filter((r) => (r.grade ?? "local") === "local")), model.sideM, frameShape).polygons,
    path: unionPathRoads(
      model.roads.filter((r) => r.kind === "road" && r.grade === "path").map((r) => ({ line: r.line, width: r.width })),
      model.sideM,
      frameShape,
    ).polygons,
  };
  const roads = { arterial: [], local: [], path: [] } as Record<RoadGrade, MultiPolygon>;
  let taken: MultiPolygon = [];
  for (const grade of ROAD_GRADES_BY_PRIORITY) {
    if (raw[grade].length === 0) continue;
    raw[grade] = snapMulti(raw[grade]);
    roads[grade] = taken.length ? difference(raw[grade], taken) : raw[grade];
    // Union the raw fill (not the difference) — polygon-clipping is far more robust that way.
    taken = taken.length ? union(taken, raw[grade]) : raw[grade];
  }
  const remaining = taken.length ? difference(frame, taken) : [frame];
  const pieces = [...ROAD_GRADES_BY_PRIORITY.map((g) => roads[g]), remaining].map(snapMulti);
  const welded = weldTJunctions(pieces);
  return { roads: { arterial: welded[0]!, local: welded[1]!, path: welded[2]! }, remaining: welded[3]!, frame };
}

/** Round to 0.1 mm so near-coincident vertices from separate fills meet exactly. */
function snapMulti(multi: MultiPolygon): MultiPolygon {
  const q = (v: number) => Math.round(v * 1e4) / 1e4;
  return multi.map((poly) => poly.map((ring) => ring.map(([x, y]) => [q(x!), q(y!)] as [number, number])));
}

/**
 * Insert into every ring edge any vertex of any piece that lies on that edge, so neighbouring pieces
 * triangulate against the same boundary vertices (no T-junctions, hence no cracks after draping).
 */
function weldTJunctions(pieces: MultiPolygon[]): MultiPolygon[] {
  const CELL = 4;
  const EPS = 2e-4;
  const buckets = new Map<string, [number, number][]>();
  const seen = new Set<string>();
  for (const multi of pieces) for (const poly of multi) for (const ring of poly) for (const [x, y] of ring) {
    const id = `${x},${y}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const k = `${Math.floor(x! / CELL)},${Math.floor(y! / CELL)}`;
    let list = buckets.get(k);
    if (!list) buckets.set(k, (list = []));
    list.push([x!, y!]);
  }
  const ringWeld = (ring: number[][]): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i] as [number, number];
      const [bx, by] = ring[i + 1] as [number, number];
      out.push([ax, ay]);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) continue;
      const len = Math.sqrt(len2);
      const hits: [number, number, number][] = [];
      const x0 = Math.floor((Math.min(ax, bx) - EPS) / CELL);
      const x1 = Math.floor((Math.max(ax, bx) + EPS) / CELL);
      const y0 = Math.floor((Math.min(ay, by) - EPS) / CELL);
      const y1 = Math.floor((Math.max(ay, by) + EPS) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        for (const [px, py] of buckets.get(`${cx},${cy}`) ?? []) {
          const t = ((px - ax) * dx + (py - ay) * dy) / len2;
          if (t * len <= EPS || (1 - t) * len <= EPS) continue;
          if (Math.abs((px - ax) * dy - (py - ay) * dx) / len > EPS) continue;
          hits.push([t, px, py]);
        }
      }
      hits.sort((a, b) => a[0] - b[0]);
      for (const [, px, py] of hits) out.push([px, py]);
    }
    out.push(out[0]!);
    return out;
  };
  return pieces.map((multi) => multi.map((poly) => poly.map(ringWeld)));
}

/** Plan triangles of a multipolygon, cut on the terrain grid (no lift). */
export function groundTriangles(multi: MultiPolygon, field: TerrainField, sideM: number): Tri[] {
  const out: Tri[] = [];
  for (const polygon of multi) {
    const [outerRing, ...holeRings] = polygon;
    if (!outerRing || outerRing.length < 4) continue;
    const open = (ring: number[][]) => ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y));
    const contour = open(outerRing);
    const holes = holeRings.map(open).filter((h) => h.length >= 3);
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = [...contour, ...holes.flat()];
    const tris: Tri[] = faces.map(([a, b, c]) => [
      [all[a]!.x, all[a]!.y],
      [all[b]!.x, all[b]!.y],
      [all[c]!.x, all[c]!.y],
    ] as Tri);
    for (const tri of clipTrianglesToTerrainGrid(tris, field, sideM)) out.push(tri);
  }
  return out;
}

export type DrapedTri = [[number, number, number], [number, number, number], [number, number, number]];

/** Triangles with the exact terrain-mesh height at every vertex (east, north, z). */
export function drapeTriangles(tris: Tri[], field: TerrainField, sideM: number): DrapedTri[] {
  // Grid crossings computed from either side of a shared edge can differ by a few µm; weld at 0.1 mm.
  const q = (v: number) => Math.round(v * 1e4) / 1e4;
  const out: DrapedTri[] = [];
  for (const tri of tris) {
    const p = tri.map(([e, n]: Pt) => [q(e), q(n)] as const);
    const area2 = (p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1]) - (p[2]![0] - p[0]![0]) * (p[1]![1] - p[0]![1]);
    if (Math.abs(area2) < 1e-10) continue;
    out.push(p.map(([e, n]) => [e, n, terrainMeshHeight(field, sideM, e, n)]) as DrapedTri);
  }
  return out;
}

/** Three.js geometry (x east, y up, z = −north) for draped ground triangles. */
export function groundGeometry(draped: DrapedTri[], tint?: (z: number) => [number, number, number]): THREE.BufferGeometry | null {
  if (draped.length === 0) return null;
  const positions = new Float32Array(draped.length * 9);
  const colors = tint ? new Float32Array(draped.length * 9) : null;
  let k = 0;
  for (const tri of draped) {
    for (const [e, n, z] of tri) {
      if (colors) {
        const [r, g, b] = tint!(z);
        colors[k] = r;
        colors[k + 1] = g;
        colors[k + 2] = b;
      }
      positions[k++] = e;
      positions[k++] = z;
      positions[k++] = -n;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
