import ClipperLib from "clipper-lib";
import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";
import { signedArea } from "./geo";
import type { Pt } from "../types";

export type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";

export type ClipContext = {
  layer?: string;
  featureId?: string | number;
  operation?: string;
};

type RawClip = {
  union: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
  intersection: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
  difference: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

const CLIPPER_SCALE = 1000;
const SNAP_M = 0.001;
const COLINEAR_EPS = 1e-8;
const MIN_RING_AREA_M2 = 1e-6;
const UNKINK_DELTA_M = 0.02;

function rawClip(): RawClip {
  const loaded = polygonClipping as unknown as RawClip & { default?: RawClip };
  if (typeof loaded.union === "function") return loaded;
  if (loaded.default && typeof loaded.default.union === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const raw = rawClip();

function snapScalar(value: number): number {
  return Math.round(value / SNAP_M) * SNAP_M;
}

function snapPoint(point: Pt): [number, number] {
  return [snapScalar(point[0]), snapScalar(point[1])];
}

function samePoint(a: Pt, b: Pt): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < SNAP_M * 0.5;
}

function openRing(ring: Ring): Pt[] {
  if (ring.length < 2) return ring.map(([x, y]) => [x, y]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (samePoint(first, last)) return ring.slice(0, -1).map(([x, y]) => [x, y]);
  return ring.map(([x, y]) => [x, y]);
}

function closeRing(open: Pt[]): Ring {
  if (open.length === 0) return [];
  const first = open[0]!;
  const last = open[open.length - 1]!;
  if (samePoint(first, last)) return open.map(([x, y]) => [x, y] as [number, number]);
  return [...open.map(([x, y]) => [x, y] as [number, number]), [first[0], first[1]]];
}

export function cleanOpenRing(points: Pt[]): Pt[] | null {
  const snapped: Pt[] = [];
  for (const point of points) {
    const next = snapPoint(point);
    const last = snapped[snapped.length - 1];
    if (last && samePoint(last, next)) continue;
    snapped.push(next);
  }
  if (snapped.length >= 2) {
    const first = snapped[0]!;
    const last = snapped[snapped.length - 1]!;
    if (samePoint(first, last)) snapped.pop();
  }
  if (snapped.length < 3) return null;
  const simplified: Pt[] = [];
  const count = snapped.length;
  for (let i = 0; i < count; i++) {
    const prev = snapped[(i + count - 1) % count]!;
    const current = snapped[i]!;
    const next = snapped[(i + 1) % count]!;
    const cross =
      (current[0] - prev[0]) * (next[1] - current[1]) - (current[1] - prev[1]) * (next[0] - current[0]);
    if (Math.abs(cross) > COLINEAR_EPS) simplified.push(current);
  }
  return simplified.length >= 3 ? simplified : null;
}

function orientOpen(open: Pt[], ccw: boolean): Pt[] {
  const positive = signedArea(open) > 0;
  return positive === ccw ? open : open.slice().reverse();
}

function toClipperPath(open: Pt[]): ClipperLib.Paths[0] {
  return open.map(([x, y]) => ({
    X: Math.round(x * CLIPPER_SCALE),
    Y: Math.round(y * CLIPPER_SCALE),
  }));
}

function fromClipperPath(path: ClipperLib.Paths[0]): Ring {
  const out: Ring = path.map((p) => [p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE]);
  if (out.length > 0) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  }
  return out;
}

function isMultiPolygon(geom: Polygon | MultiPolygon): geom is MultiPolygon {
  const head = geom[0]?.[0];
  return Boolean(head && Array.isArray(head) && Array.isArray(head[0]));
}

function unkinkRing(ring: Ring): Ring | null {
  const open = cleanOpenRing(openRing(ring));
  if (!open) return null;
  const delta = Math.max(1, UNKINK_DELTA_M * CLIPPER_SCALE);
  const co = new ClipperLib.ClipperOffset(2, delta);
  co.AddPath(toClipperPath(open), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const grown: ClipperLib.Paths = [];
  co.Execute(grown, delta);
  if (grown.length === 0) return closeRing(open);
  const co2 = new ClipperLib.ClipperOffset(2, delta);
  co2.AddPaths(grown, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const shrunk: ClipperLib.Paths = [];
  co2.Execute(shrunk, -delta);
  if (shrunk.length === 0) return closeRing(open);
  let best: Ring | null = null;
  let bestArea = 0;
  for (const path of shrunk) {
    const candidate = fromClipperPath(path);
    const area = Math.abs(signedArea(candidate));
    if (area > bestArea) {
      bestArea = area;
      best = candidate;
    }
  }
  return best;
}

function prepareRing(ring: Ring, ccw: boolean): Ring | null {
  const cleaned = cleanOpenRing(openRing(ring));
  if (!cleaned) return null;
  const oriented = orientOpen(cleaned, ccw);
  const closed = closeRing(oriented);
  if (Math.abs(signedArea(closed)) < MIN_RING_AREA_M2) return null;
  return closed;
}

export function preparePolygonForClip(polygon: Polygon): Polygon | null {
  const outer = prepareRing(polygon[0]!, true);
  if (!outer) return null;
  const holes = polygon
    .slice(1)
    .map((hole) => prepareRing(hole, false))
    .filter((hole): hole is Ring => hole !== null);
  return [outer, ...holes];
}

export function prepareMultiPolygonForClip(multi: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const polygon of multi) {
    const prepared = preparePolygonForClip(polygon);
    if (prepared) out.push(prepared);
  }
  return out;
}

function normalizeToMulti(geom: Polygon | MultiPolygon): MultiPolygon {
  if (isMultiPolygon(geom)) return prepareMultiPolygonForClip(geom);
  const prepared = preparePolygonForClip(geom);
  return prepared ? [prepared] : [];
}

function repairMulti(multi: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const polygon of multi) {
    const outer = unkinkRing(polygon[0]!);
    if (!outer) continue;
    const holes = polygon
      .slice(1)
      .map((hole) => unkinkRing(hole))
      .filter((hole): hole is Ring => hole !== null);
    const repaired = preparePolygonForClip([outer, ...holes]);
    if (repaired) out.push(repaired);
  }
  return out;
}

function warnClipSkip(context: ClipContext | undefined, message: string): void {
  const layer = context?.layer ?? "geometry";
  const id = context?.featureId == null ? "" : ` #${context.featureId}`;
  const op = context?.operation ?? "clip";
  console.warn(`CityCut: skipped ${op} on ${layer}${id}: ${message}`);
}

function runRaw(
  op: "union" | "intersection" | "difference",
  operands: Array<Polygon | MultiPolygon>,
): MultiPolygon {
  if (operands.length === 0) return [];
  if (op === "union") return raw.union(operands[0]!, ...operands.slice(1));
  if (op === "intersection") return raw.intersection(operands[0]!, ...operands.slice(1));
  return raw.difference(operands[0]!, ...operands.slice(1));
}

function tryRawOp(op: "union" | "intersection" | "difference", multis: MultiPolygon[]): MultiPolygon | null {
  if (multis.length === 0) return [];
  try {
    return runRaw(op, multis);
  } catch {
    if (op !== "union" || multis.length < 2) return null;
    let acc = multis[0]!;
    for (let i = 1; i < multis.length; i++) {
      try {
        acc = raw.union(acc, multis[i]!);
      } catch {
        continue;
      }
    }
    return acc.length > 0 ? acc : null;
  }
}

function coerceToMulti(geom: Polygon | MultiPolygon): MultiPolygon {
  if (isMultiPolygon(geom)) return geom;
  const polygon = geom as Polygon;
  return polygon.length > 0 ? [polygon] : [];
}

function clipOperation(
  op: "union" | "intersection" | "difference",
  operands: Array<Polygon | MultiPolygon>,
  context?: ClipContext,
): MultiPolygon {
  const rawMultis = operands.map((geom) => coerceToMulti(geom)).filter((multi) => multi.length > 0);
  if (rawMultis.length === 0) return [];
  let result = tryRawOp(op, rawMultis);
  if (result && result.length > 0) return result;
  const prepared = operands.map((geom) => normalizeToMulti(geom)).filter((multi) => multi.length > 0);
  result = tryRawOp(op, prepared);
  if (result && result.length > 0) return prepareMultiPolygonForClip(result);
  const repaired = prepared.map((multi) => repairMulti(multi)).filter((multi) => multi.length > 0);
  result = tryRawOp(op, repaired);
  if (result && result.length > 0) return prepareMultiPolygonForClip(result);
  if (op === "union") {
    const pieces: MultiPolygon = [];
    for (const multi of repaired) {
      for (const polygon of multi) {
        try {
          const kept = raw.union([polygon]);
          if (kept.length > 0) pieces.push(...kept);
        } catch {
          warnClipSkip(context, "dropped one polygon after union failure");
        }
      }
    }
    if (pieces.length > 0) return prepareMultiPolygonForClip(pieces);
  }
  warnClipSkip(context, "polygon-clipping failed after clean and repair");
  return [];
}

function isClipContext(value: unknown): value is ClipContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return "layer" in value || "featureId" in value || "operation" in value;
}

function parseClipArgs(geom: Polygon | MultiPolygon, more: Array<Polygon | MultiPolygon | ClipContext>) {
  let context: ClipContext | undefined;
  const operands: Array<Polygon | MultiPolygon> = [geom];
  for (const item of more) {
    if (isClipContext(item)) {
      context = item;
      continue;
    }
    operands.push(item);
  }
  return { operands, context };
}

function clipOperationRaw(
  op: "union" | "intersection" | "difference",
  operands: Array<Polygon | MultiPolygon>,
): MultiPolygon {
  const multis = operands.map((geom) => coerceToMulti(geom)).filter((multi) => multi.length > 0);
  if (multis.length === 0) return [];
  return tryRawOp(op, multis) ?? [];
}

export function clipUnionRaw(geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>): MultiPolygon {
  const { operands } = parseClipArgs(geom, more);
  return clipOperationRaw("union", operands);
}

export function clipIntersectionRaw(
  geom: Polygon | MultiPolygon,
  ...more: Array<Polygon | MultiPolygon>
): MultiPolygon {
  const { operands } = parseClipArgs(geom, more);
  return clipOperationRaw("intersection", operands);
}

export function clipDifferenceRaw(
  geom: Polygon | MultiPolygon,
  ...more: Array<Polygon | MultiPolygon>
): MultiPolygon {
  const { operands } = parseClipArgs(geom, more);
  return clipOperationRaw("difference", operands);
}

export function clipUnion(
  geom: Polygon | MultiPolygon,
  ...more: Array<Polygon | MultiPolygon | ClipContext>
): MultiPolygon {
  const { operands, context } = parseClipArgs(geom, more);
  return clipOperation("union", operands, context);
}

export function clipIntersection(
  geom: Polygon | MultiPolygon,
  ...more: Array<Polygon | MultiPolygon | ClipContext>
): MultiPolygon {
  const { operands, context } = parseClipArgs(geom, more);
  return clipOperation("intersection", operands, context);
}

export function clipDifference(
  geom: Polygon | MultiPolygon,
  ...more: Array<Polygon | MultiPolygon | ClipContext>
): MultiPolygon {
  const { operands, context } = parseClipArgs(geom, more);
  return clipOperation("difference", operands, context);
}

export function clipUnionEach(polygons: Polygon[], context?: ClipContext): MultiPolygon {
  let acc: MultiPolygon = [];
  for (let index = 0; index < polygons.length; index++) {
    const prepared = preparePolygonForClip(polygons[index]!);
    if (!prepared) continue;
    const next =
      acc.length === 0
        ? [prepared]
        : clipUnion(acc, prepared, { ...context, featureId: index, operation: "union" } as ClipContext);
    if (next.length === 0 && acc.length > 0) {
      warnClipSkip({ ...context, featureId: index, operation: "union" }, "could not merge corridor polygon");
      continue;
    }
    acc = next;
  }
  return acc;
}

export function cleanRingForFrame(points: Pt[]): Pt[] {
  const cleaned = cleanOpenRing(points);
  if (!cleaned) return points;
  return closeRing(cleaned).slice(0, -1);
}
