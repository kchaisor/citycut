import ClipperLib from "clipper-lib";
import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";
import { signedArea } from "./geo";

/** Clipper integer scale: 1 mm per unit (0.001 m). */
export const CLIPPER_SCALE = 1000;

/** Max sagitta/chord error on Clipper round joins (m). ~8 segments per 90° at R=2 m. */
export const CLIPPER_ARC_CHORD_M = 0.01;
/** Max angle step on Clipper round joins (degrees). */
export const CLIPPER_ARC_MAX_STEP_DEG = 12;

/** Round-join sagitta for centreline buffers and morphological close (m). */
export const CLIPPER_ARC_TOLERANCE_M = CLIPPER_ARC_CHORD_M;
export const CLIPPER_POLYGON_OFFSET_ARC_TOLERANCE_M = CLIPPER_ARC_CHORD_M;
export const CLIPPER_FOOTPATH_FILLET_ARC_TOLERANCE_M = CLIPPER_ARC_CHORD_M;

/** Segment count for a circular arc: min step ≤ `maxStepDeg` and sagitta ≤ `chordM`. */
export function arcSegmentCount(
  radiusM: number,
  sweepRad: number,
  chordM = CLIPPER_ARC_CHORD_M,
  maxStepDeg = CLIPPER_ARC_MAX_STEP_DEG,
): number {
  const r = Math.max(radiusM, 0.01);
  const sweep = Math.abs(sweepRad);
  const stepRad = (Math.max(maxStepDeg, 1) * Math.PI) / 180;
  const byAngle = Math.ceil(sweep / stepRad);
  const tol = Math.max(chordM, 1e-4);
  const cosArg = Math.max(-1, Math.min(1, 1 - tol / r));
  let maxAng = 2 * Math.acos(cosArg);
  if (!Number.isFinite(maxAng) || maxAng < stepRad) maxAng = stepRad;
  const byChord = Math.ceil(sweep / maxAng);
  return Math.max(2, byAngle, byChord);
}

/** Clipper offset arc tolerance (m) from chord cap and angle step at a typical radius. */
export function clipperArcToleranceM(_typicalRadiusM = 2): number {
  return CLIPPER_ARC_TOLERANCE_M;
}

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

/** Nesting depth from immediate containment (0 = outermost shell). */
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

type TaggedRing = { ring: Ring; depth: number };

function directHoles(parent: TaggedRing, tagged: TaggedRing[]): Ring[] {
  const holes: Ring[] = [];
  for (const candidate of tagged) {
    if (candidate.depth !== parent.depth + 1 || candidate.depth % 2 === 0) continue;
    if (!pointInRing(ringCentroid(candidate.ring), parent.ring)) continue;
    let blocked = false;
    for (const island of tagged) {
      if (island.depth !== parent.depth + 2 || island.depth % 2 !== 0) continue;
      if (!pointInRing(ringCentroid(island.ring), parent.ring)) continue;
      if (pointInRing(ringCentroid(candidate.ring), island.ring)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) holes.push(candidate.ring);
  }
  return holes;
}

function normalizeFromRings(rings: Ring[]): MultiPolygon {
  if (rings.length === 0) return [];
  const tagged: TaggedRing[] = rings.map((ring) => ({ ring, depth: containmentDepth(ring, rings) }));
  const out: MultiPolygon = [];
  for (const parent of tagged) {
    if (parent.depth % 2 !== 0) continue;
    const holes = directHoles(parent, tagged);
    out.push(holes.length > 0 ? [parent.ring, ...holes] : [parent.ring]);
  }
  return out;
}

/** Rebuild multipolygons from rings using even/odd nesting depth. */
export function normalizeMultiPolygonByParity(polygons: MultiPolygon): MultiPolygon {
  return normalizeFromRings(flattenRings(polygons));
}

/** Offset one closed ring; may split into multiple rings. */
function offsetSingleRing(
  open: Ring,
  deltaM: number,
  allowEmpty: boolean,
  arcToleranceM = clipperArcToleranceM(2),
): Ring[] {
  if (open.length < 3 || !(Math.abs(deltaM) > 1e-9)) {
    const closed = openRing(open);
    return closed.length >= 3 ? [closeRing(closed)] : [];
  }
  const delta = Math.round(deltaM * CLIPPER_SCALE);
  const arcTol = Math.max(1, Math.round(arcToleranceM * CLIPPER_SCALE));
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

function offsetNormalizedByParity(
  normalized: MultiPolygon,
  deltaM: number,
  arcToleranceM = CLIPPER_POLYGON_OFFSET_ARC_TOLERANCE_M,
): MultiPolygon {
  const rings = flattenRings(normalized);
  if (rings.length === 0) return [];
  const tagged = rings.map((ring) => ({ ring, depth: containmentDepth(ring, rings) }));
  const expanded: Ring[] = [];
  for (const { ring, depth } of tagged) {
    const sign = depth % 2 === 0 ? deltaM : -deltaM;
    expanded.push(...offsetSingleRing(openRing(ring), sign, depth % 2 === 1, arcToleranceM));
  }
  if (expanded.length === 0) {
    throw new Error(`Clipper offset produced no rings (delta=${deltaM} m)`);
  }
  return normalizeFromRings(expanded);
}

/** Offset every polygon in a multipolygon; round joins at `arcToleranceM`. */
export function offsetMultiPolygon(
  polygons: MultiPolygon,
  deltaM: number,
  arcToleranceM = clipperArcToleranceM(2),
): MultiPolygon {
  if (polygons.length === 0 || !(Math.abs(deltaM) > 1e-9)) return polygons;
  const normalized = normalizeMultiPolygonByParity(polygons);
  return offsetNormalizedByParity(normalized, deltaM, arcToleranceM);
}

function intersectMultiPolygon(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];
  try {
    return normalizeMultiPolygonByParity(intersection(a, b));
  } catch {
    throw new Error("polygon intersection failed during morphological close clamp");
  }
}

/** Closing: offset +r then −r, clamped to the +r dilation (fills concave pockets only). */
export function offsetCloseMultiPolygon(
  polygons: MultiPolygon,
  radiusM: number,
  arcToleranceM = CLIPPER_ARC_CHORD_M,
): MultiPolygon {
  if (polygons.length === 0 || !(radiusM > 0)) return polygons;
  const normalized = normalizeMultiPolygonByParity(polygons);
  const expanded = offsetNormalizedByParity(normalized, radiusM, arcToleranceM);
  const contracted = offsetNormalizedByParity(expanded, -radiusM, arcToleranceM);
  const cap = offsetNormalizedByParity(normalized, radiusM + 0.01, arcToleranceM);
  return intersectMultiPolygon(contracted, cap);
}
