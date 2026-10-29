import ClipperLib from "clipper-lib";
import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";
import { signedArea } from "./geo";

export const CLIPPER_SCALE = 1000;

export const CLIPPER_ARC_TOLERANCE_M = 0.05;

type ClipperPoint = { X: number; Y: number };
type ClipperPath = ClipperPoint[];

type ClipFns = {
  intersection: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.intersection === "function") return loaded;
  if (loaded.default && typeof loaded.default.intersection === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { intersection } = clippingFns();

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

function ringAbsArea(ring: Ring): number {
  return Math.abs(signedArea(openRing(ring)));
}

function flattenRings(polygons: MultiPolygon): Ring[] {
  const rings: Ring[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (ring && ring.length >= 4) rings.push(ring);
    }
  }
  return rings;
}

function ringContainsRing(outer: Ring, inner: Ring): boolean {
  const probe = openRing(inner)[0];
  if (!probe) return false;
  return pointInRing(probe, outer);
}

function immediateParent(ring: Ring, all: Ring[]): Ring | null {
  const areaR = ringAbsArea(ring);
  let parent: Ring | null = null;
  let parentArea = Infinity;
  for (const other of all) {
    if (other === ring || ringAbsArea(other) <= areaR) continue;
    if (!ringContainsRing(other, ring)) continue;
    const area = ringAbsArea(other);
    if (area < parentArea) {
      parentArea = area;
      parent = other;
    }
  }
  return parent;
}

export function containmentDepth(ring: Ring, all: Ring[]): number {
  let depth = 0;
  let current: Ring | null = ring;
  const seen = new Set<Ring>();
  for (let guard = 0; guard < all.length + 2; guard++) {
    const parent: Ring | null = current ? immediateParent(current, all) : null;
    if (!parent || seen.has(parent)) break;
    seen.add(parent);
    depth++;
    current = parent;
  }
  return depth;
}

function normalizeFromRings(rings: Ring[]): MultiPolygon {
  if (rings.length === 0) return [];
  const parents = rings.map((ring) => immediateParent(ring, rings));
  const depthOf = new Map<Ring, number>();
  const depth = (index: number): number => {
    const ring = rings[index]!;
    const known = depthOf.get(ring);
    if (known !== undefined) return known;
    let d = 0;
    let current: Ring | null = parents[index] ?? null;
    const seen = new Set<Ring>();
    while (current && !seen.has(current) && d <= rings.length) {
      seen.add(current);
      d++;
      current = parents[rings.indexOf(current)] ?? null;
    }
    depthOf.set(ring, d);
    return d;
  };
  const holesOf = new Map<Ring, Ring[]>();
  rings.forEach((ring, index) => {
    const parent = parents[index];
    if (depth(index) % 2 === 1 && parent) {
      const list = holesOf.get(parent) ?? [];
      list.push(ring);
      holesOf.set(parent, list);
    }
  });
  const out: MultiPolygon = [];
  rings.forEach((ring, index) => {
    if (depth(index) % 2 !== 0) return;
    const holes = holesOf.get(ring) ?? [];
    out.push(holes.length > 0 ? [ring, ...holes] : [ring]);
  });
  return out;
}

export function normalizeMultiPolygonByParity(polygons: MultiPolygon): MultiPolygon {
  return normalizeFromRings(flattenRings(polygons));
}

function offsetSingleRing(open: Ring, deltaM: number, allowEmpty: boolean): Ring[] {
  if (open.length < 3 || !(Math.abs(deltaM) > 1e-9)) {
    const closed = openRing(open);
    return closed.length >= 3 ? [closeRing(closed)] : [];
  }
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

function offsetNormalizedByParity(normalized: MultiPolygon, deltaM: number): MultiPolygon {
  const rings = flattenRings(normalized);
  if (rings.length === 0) return [];
  const tagged = rings.map((ring) => ({ ring, depth: containmentDepth(ring, rings) }));
  const expanded: Ring[] = [];
  for (const { ring, depth } of tagged) {
    const sign = depth % 2 === 0 ? deltaM : -deltaM;
    expanded.push(...offsetSingleRing(openRing(ring), sign, depth % 2 === 1));
  }
  if (expanded.length === 0) {
    throw new Error(`Clipper offset produced no rings (delta=${deltaM} m)`);
  }
  return normalizeFromRings(expanded);
}

export function offsetMultiPolygon(polygons: MultiPolygon, deltaM: number): MultiPolygon {
  if (polygons.length === 0 || !(Math.abs(deltaM) > 1e-9)) return polygons;
  const normalized = normalizeMultiPolygonByParity(polygons);
  return offsetNormalizedByParity(normalized, deltaM);
}

function intersectMultiPolygon(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];
  try {
    return normalizeMultiPolygonByParity(intersection(a, b));
  } catch {
    throw new Error("polygon intersection failed during morphological close clamp");
  }
}

export function offsetCloseMultiPolygon(polygons: MultiPolygon, radiusM: number): MultiPolygon {
  if (polygons.length === 0 || !(radiusM > 0)) return polygons;
  const normalized = normalizeMultiPolygonByParity(polygons);
  const expanded = offsetNormalizedByParity(normalized, radiusM);
  const contracted = offsetNormalizedByParity(expanded, -radiusM);
  const cap = offsetNormalizedByParity(normalized, radiusM + 0.01);
  return intersectMultiPolygon(contracted, cap);
}
