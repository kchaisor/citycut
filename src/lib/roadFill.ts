import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";
import { polylineLength, signedArea } from "./geo";
import { DEFAULT_SITE_FRAME_SHAPE, siteFramePolygon, type SiteFrameShape } from "./siteFrame";
import type { Pt, RoadFeat } from "../types";

type ClipFns = {
  union: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
  intersection: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.union === "function") return loaded;
  if (loaded.default && typeof loaded.default.union === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { union, intersection } = clippingFns();

/** Centreline points farther than this from the chord are kept. Invisible at 1:500. */
const SIMPLIFY_M = 0.35;
/** Final boundary simplification, in metres. */
const OUTPUT_SIMPLIFY_M = 0.12;
const SNAP_M = 0.01;
const MIN_AREA_M2 = 0.8;
const ARC = Math.PI / 4;

export type RoadFill = {
  /** Unioned carriageway. Each polygon is an outer ring plus holes (city blocks). */
  polygons: MultiPolygon;
  /** Wall time of buffer, union, and frame clip. */
  ms: number;
  /** Buffered centreline polygons before the union. */
  inputs: number;
};

function direction(a: Pt, b: Pt): { ang: number } | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  return { ang: Math.atan2(dy, dx) };
}

function wrap(delta: number): number {
  const tau = Math.PI * 2;
  let value = delta % tau;
  if (value <= -Math.PI) value += tau;
  if (value > Math.PI) value -= tau;
  return value;
}

function at(center: Pt, angle: number, radius: number): Pt {
  return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
}

function arc(center: Pt, radius: number, from: number, sweep: number): Pt[] {
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / ARC));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    out.push(at(center, from + (sweep * i) / steps, radius));
  }
  return out;
}

function pointLineDistance(point: Pt, start: Pt, end: Pt): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / length;
}

function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const [start, end] = next;
    let max = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const dist = pointLineDistance(points[i], points[start], points[end]);
      if (dist > max) {
        max = dist;
        index = i;
      }
    }
    if (index >= 0 && max > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function dedupe(line: Pt[], epsilon = 0.05): Pt[] {
  const out: Pt[] = [];
  for (const point of line) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > epsilon) out.push(point);
  }
  return out;
}

function isLoop(line: Pt[]): boolean {
  if (line.length < 4) return false;
  const gap = Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1]);
  return gap <= 1 && polylineLength(line) > 6;
}

function pushJoin(into: Pt[], side: "left" | "right", turn: number, vertex: Pt, inAng: number, outAng: number, half: number) {
  const sign = side === "left" ? 1 : -1;
  const inNormal = inAng + sign * (Math.PI / 2);
  const outNormal = outAng + sign * (Math.PI / 2);
  const outer = side === "left" ? turn < -1e-3 : turn > 1e-3;
  if (Math.abs(turn) < 0.05) {
    into.push(at(vertex, outNormal, half));
    return;
  }
  if (outer) into.push(...arc(vertex, half, inNormal, turn));
  else into.push(at(vertex, outNormal, half));
}

function buildSides(pts: Pt[], half: number): { left: Pt[]; right: Pt[] } | null {
  if (pts.length < 2) return null;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const incoming = i > 0 ? direction(pts[i - 1], pts[i]) : null;
    const outgoing = i < pts.length - 1 ? direction(pts[i], pts[i + 1]) : null;
    if (!incoming && outgoing) {
      left.push(at(pts[i], outgoing.ang + Math.PI / 2, half));
      right.push(at(pts[i], outgoing.ang - Math.PI / 2, half));
      continue;
    }
    if (incoming && !outgoing) {
      left.push(at(pts[i], incoming.ang + Math.PI / 2, half));
      right.push(at(pts[i], incoming.ang - Math.PI / 2, half));
      continue;
    }
    if (!incoming || !outgoing) continue;
    const turn = wrap(outgoing.ang - incoming.ang);
    pushJoin(left, "left", turn, pts[i], incoming.ang, outgoing.ang, half);
    pushJoin(right, "right", turn, pts[i], incoming.ang, outgoing.ang, half);
  }
  if (left.length < 2 || right.length < 2) return null;
  return { left, right };
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const cross = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const ab = cross(a, b, c) * cross(a, b, d);
  const cd = cross(c, d, a) * cross(c, d, b);
  return ab < 0 && cd < 0;
}

function selfIntersects(ring: Pt[]): boolean {
  const open =
    ring.length > 1 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1e-6
      ? ring.slice(0, -1)
      : ring;
  const n = open.length;
  if (n > 900) return true;
  for (let i = 0; i < n; i++) {
    const a = open[i];
    const b = open[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const c = open[j];
      const d = open[(j + 1) % n];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

function cleanOpen(points: Pt[], tolerance = 0): Pair[] | null {
  const source = tolerance > 0 ? simplify(points, tolerance) : points;
  const snapped: Pair[] = [];
  for (const point of source) {
    const next: Pair = [Math.round(point[0] / SNAP_M) * SNAP_M, Math.round(point[1] / SNAP_M) * SNAP_M];
    const last = snapped[snapped.length - 1];
    if (last && last[0] === next[0] && last[1] === next[1]) continue;
    snapped.push(next);
  }
  if (snapped.length >= 2) {
    const first = snapped[0];
    const last = snapped[snapped.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) snapped.pop();
  }
  if (snapped.length < 3 || Math.abs(signedArea(snapped)) < MIN_AREA_M2) return null;
  const simplified: Pair[] = [];
  const count = snapped.length;
  for (let i = 0; i < count; i++) {
    const prev = snapped[(i + count - 1) % count];
    const current = snapped[i];
    const next = snapped[(i + 1) % count];
    const cross =
      (current[0] - prev[0]) * (next[1] - current[1]) - (current[1] - prev[1]) * (next[0] - current[0]);
    if (Math.abs(cross) > 1e-8) simplified.push(current);
  }
  if (simplified.length < 3 || Math.abs(signedArea(simplified)) < MIN_AREA_M2) return null;
  return simplified;
}

function close(open: Pair[]): Ring {
  return [...open, open[0]];
}

function orient(open: Pair[], ccw: boolean): Ring {
  const positive = signedArea(open) > 0;
  const ring = positive === ccw ? open : open.slice().reverse();
  return close(ring);
}

function toPolygon(outer: Pt[], holes: Pt[][] = []): Polygon | null {
  const shell = cleanOpen(outer, OUTPUT_SIMPLIFY_M);
  if (!shell) return null;
  const inners: Ring[] = [];
  for (const hole of holes) {
    const open = cleanOpen(hole, OUTPUT_SIMPLIFY_M);
    if (!open) continue;
    inners.push(orient(open, false));
  }
  return [orient(shell, true), ...inners];
}

function bufferOpen(pts: Pt[], half: number): Pt[] | null {
  const sides = buildSides(pts, half);
  if (!sides) return null;
  const start = direction(pts[0], pts[1]);
  const end = direction(pts[pts.length - 2], pts[pts.length - 1]);
  if (!start || !end) return null;
  const endCap = arc(pts[pts.length - 1], half, end.ang + Math.PI / 2, -Math.PI).slice(0, -1);
  const startCap = arc(pts[0], half, start.ang - Math.PI / 2, -Math.PI).slice(0, -1);
  return [...sides.left, ...endCap, ...sides.right.slice().reverse(), ...startCap];
}

function closedSide(pts: Pt[], half: number, sign: 1 | -1): Pt[] {
  const out: Pt[] = [];
  const count = pts.length;
  for (let i = 0; i < count; i++) {
    const incoming = direction(pts[(i - 1 + count) % count], pts[i]);
    const outgoing = direction(pts[i], pts[(i + 1) % count]);
    if (!incoming || !outgoing) continue;
    const turn = wrap(outgoing.ang - incoming.ang);
    const side = sign > 0 ? "left" : "right";
    pushJoin(out, side, turn, pts[i], incoming.ang, outgoing.ang, half);
  }
  return out;
}

function pointInRing(point: Pt, ring: Pt[]): boolean {
  let hits = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1];
    const yj = ring[j][1];
    if (yi > point[1] === yj > point[1]) continue;
    const x = ((ring[j][0] - ring[i][0]) * (point[1] - yi)) / (yj - yi) + ring[i][0];
    if (point[0] < x) hits += 1;
  }
  return hits % 2 === 1;
}

function bufferLoop(pts: Pt[], half: number): Polygon | null {
  const open = dedupe(pts);
  const ring = isLoop(open) ? open.slice(0, -1) : open;
  if (ring.length < 3) return null;
  const left = closedSide(ring, half, 1);
  const right = closedSide(ring, half, -1);
  const leftArea = Math.abs(signedArea(left));
  const rightArea = Math.abs(signedArea(right));
  const outer = leftArea >= rightArea ? left : right;
  const inner = leftArea >= rightArea ? right : left;
  const holes: Pt[][] = [];
  if (Math.abs(signedArea(inner)) > 1) {
    let east = 0;
    let north = 0;
    for (const point of inner) {
      east += point[0];
      north += point[1];
    }
    const centroid: Pt = [east / inner.length, north / inner.length];
    if (pointInRing(centroid, outer) && Math.abs(signedArea(inner)) < Math.abs(signedArea(outer)) * 0.98) {
      holes.push(inner);
    }
  }
  return toPolygon(outer, holes);
}

function circle(center: Pt, radius: number): Pt[] {
  return arc(center, radius, 0, Math.PI * 2);
}

function segmentBox(a: Pt, b: Pt, half: number): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return circle(a, half);
  const nx = (-dy / length) * half;
  const ny = (dx / length) * half;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

function mergePair(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  try {
    return union(a, b);
  } catch {
    let acc = a;
    for (const polygon of b) {
      try {
        acc = union(acc, polygon);
      } catch {
        acc = [...acc, polygon];
      }
    }
    return acc;
  }
}

function unionList(polygons: Polygon[]): MultiPolygon {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return [polygons[0]];
  let batch: MultiPolygon[] = polygons.map((polygon) => [polygon]);
  while (batch.length > 1) {
    const next: MultiPolygon[] = [];
    for (let i = 0; i < batch.length; i += 2) {
      if (i + 1 >= batch.length) next.push(batch[i]);
      else next.push(mergePair(batch[i], batch[i + 1]));
    }
    if (next.length >= batch.length) return next.flat();
    batch = next;
  }
  return batch[0] ?? [];
}

function boxOf(polygon: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon[0]) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return { minX, minY, maxX, maxY };
}

/** Union nearby buffers first so a 1 km network does not start from one giant pair. */
function unionFast(polygons: Polygon[]): MultiPolygon {
  if (polygons.length < 24) return unionList(polygons);
  const cell = 90;
  const buckets = new Map<string, Polygon[]>();
  for (const polygon of polygons) {
    const box = boxOf(polygon);
    const key = `${Math.floor((box.minX + box.maxX) / 2 / cell)}:${Math.floor((box.minY + box.maxY) / 2 / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(polygon);
    else buckets.set(key, [polygon]);
  }
  const parts = [...buckets.values()].map((group) => unionList(group));
  return unionList(parts.flatMap((multi) => multi));
}

function capsules(pts: Pt[], half: number): Polygon[] {
  const polygons: Polygon[] = [];
  const push = (ring: Pt[]) => {
    const polygon = toPolygon(ring);
    if (polygon) polygons.push(polygon);
  };
  for (let i = 0; i < pts.length - 1; i++) push(segmentBox(pts[i], pts[i + 1], half));
  for (const point of pts) push(circle(point, half));
  return polygons;
}

/**
 * One buffered centreline. `width` is the full strip, so half of it lies on each side.
 * Roads keep a 0.4 m minimum. Footpaths pass `minWidth` 0 so 1.2 m stays 0.6 m each side.
 * A closed centreline keeps the island as a hole.
 */
export function bufferCentreline(line: Pt[], width: number, minWidth = 0.4): Polygon[] {
  const half = Math.max(width, minWidth) / 2;
  const simplified = simplify(dedupe(line), SIMPLIFY_M);
  if (simplified.length < 2) return [];
  if (isLoop(simplified)) {
    const loop = bufferLoop(simplified, half);
    if (loop && !selfIntersects(loop[0])) return [loop];
  }
  const open = bufferOpen(isLoop(simplified) ? simplified.slice(0, -1) : simplified, half);
  if (open && !selfIntersects(open)) {
    const polygon = toPolygon(open);
    if (polygon) return [polygon];
  }
  const pieces = capsules(isLoop(simplified) ? simplified.slice(0, -1) : simplified, half);
  if (pieces.length === 0) return [];
  return unionList(pieces);
}

function clipToFrame(
  polygons: MultiPolygon,
  sideM: number,
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): MultiPolygon {
  if (polygons.length === 0 || !(sideM > 0)) return [];
  const frame = siteFramePolygon(sideM, frameShape);
  try {
    return intersection(polygons, frame);
  } catch {
    const kept: Polygon[] = [];
    for (const polygon of polygons) {
      try {
        kept.push(...intersection(polygon, frame));
      } catch {
        // A single bad component should not drop the rest of the network.
      }
    }
    return kept;
  }
}

function tidy(polygons: MultiPolygon): MultiPolygon {
  const kept: MultiPolygon = [];
  for (const polygon of polygons) {
    const outer = cleanOpen(polygon[0], OUTPUT_SIMPLIFY_M);
    if (!outer) continue;
    const holes = polygon
      .slice(1)
      .map((hole) => cleanOpen(hole, OUTPUT_SIMPLIFY_M))
      .filter((hole): hole is Pair[] => hole !== null && Math.abs(signedArea(hole)) >= MIN_AREA_M2);
    const holeArea = holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0);
    if (Math.abs(signedArea(outer)) - holeArea < MIN_AREA_M2) continue;
    kept.push([orient(outer, true), ...holes.map((hole) => orient(hole, false))]);
  }
  return kept;
}

function unionStrips(
  roads: { line: Pt[]; width: number }[],
  sideM: number,
  minWidth: number,
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): RoadFill {
  const started = performance.now();
  const inputs: Polygon[] = [];
  for (const road of roads) {
    if (road.line.length < 2 || !(road.width > 0)) continue;
    inputs.push(...bufferCentreline(road.line, road.width, minWidth));
  }
  const merged = tidy(clipToFrame(unionFast(inputs), sideM, frameShape));
  return { polygons: merged, ms: performance.now() - started, inputs: inputs.length };
}

/**
 * Buffer every carriageway by its stored width and union the result.
 * Paths and rail are not included; callers pass carriageways only.
 * The union removes the internal edges that used to cross at junctions.
 */
export function unionCarriageways(
  roads: { line: Pt[]; width: number }[],
  sideM: number,
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): RoadFill {
  return unionStrips(roads, sideM, 0.4, frameShape);
}

/** Buffer each path by its stored width and union the strips (3D and exports match the site plan). */
export function unionPathRoads(
  roads: { line: Pt[]; width: number }[],
  sideM: number,
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): RoadFill {
  return unionStrips(roads, sideM, 0, frameShape);
}

export function carriagewaysOf(roads: RoadFeat[]): { line: Pt[]; width: number }[] {
  return roads
    .filter((road) => road.kind !== "rail" && road.grade !== "path")
    .map((road) => ({ line: road.line, width: road.width }));
}

/**
 * Centreline of every way the path layer already draws:
 * highway=footway (including footway=sidewalk and footway=crossing),
 * path, cycleway, steps, pedestrian, bridleway, and track.
 */
export function footpathLines(roads: RoadFeat[]): Pt[][] {
  return roads.filter((road) => road.kind !== "rail" && road.grade === "path").map((road) => road.line);
}

/**
 * Buffer each footpath by `widthM` metres (half on each side of the centreline)
 * and union the strips. A width of 0 leaves no geometry. The union is one shape,
 * so joins have no seams and a crossing is covered by the road drawn above it.
 */
export function unionFootpaths(
  lines: Pt[][],
  widthM: number,
  sideM: number,
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): RoadFill {
  if (!(widthM > 0)) return { polygons: [], ms: 0, inputs: 0 };
  return unionStrips(
    lines.map((line) => ({ line, width: widthM })),
    sideM,
    0,
    frameShape,
  );
}
