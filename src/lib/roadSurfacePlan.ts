import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";
import { openRing, signedArea } from "./geo";
import { offsetMultiPolygon } from "./polygonOffset";
import type { Pt } from "../types";

type ClipFns = {
  union: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
  intersection: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
  difference: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.union === "function") return loaded;
  if (loaded.default && typeof loaded.default.union === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { union, difference, intersection } = clippingFns();

export const ROAD_INTERIOR_HOLE_MAX_M2 = 1200;
export const ROAD_FOOTPATH_BRIDGE_M = 4;

function ringArea(open: Pair[]): number {
  return Math.abs(signedArea(open));
}

function closeRing(open: Pair[]): Ring {
  return [...open, open[0]!];
}

function unionFast(parts: Polygon[]): MultiPolygon {
  if (parts.length === 0) return [];
  let acc: MultiPolygon = [parts[0]!];
  for (let i = 1; i < parts.length; i++) {
    acc = union(acc, parts[i]!);
  }
  return acc;
}

export function fillRoadMedianHoles(road: MultiPolygon, maxHoleM2 = ROAD_INTERIOR_HOLE_MAX_M2): MultiPolygon {
  const out: MultiPolygon = [];
  for (const polygon of road) {
    const outer = polygon[0];
    if (!outer) continue;
    const holes = polygon.slice(1).filter((hole) => {
      const open = hole.slice(0, -1);
      return ringArea(open) > maxHoleM2;
    });
    out.push([outer, ...holes]);
  }
  return out;
}

export function unionBlockers(areas: Pt[][][]): MultiPolygon {
  const parts: Polygon[] = [];
  for (const rings of areas) {
    const outerOpen = openRing(rings[0] ?? []);
    if (outerOpen.length < 3) continue;
    const holes: Ring[] = [];
    for (const hole of rings.slice(1)) {
      const holeOpen = openRing(hole);
      if (holeOpen.length >= 3) holes.push(closeRing(holeOpen.map((p): Pair => [p[0], p[1]])));
    }
    parts.push([closeRing(outerOpen.map((p): Pair => [p[0], p[1]])), ...holes]);
  }
  if (parts.length === 0) return [];
  try {
    return unionFast(parts);
  } catch {
    return [];
  }
}

export function bridgeRoadFootpathGaps(
  road: MultiPolygon,
  footpath: MultiPolygon,
  blockers: MultiPolygon,
  bridgeM = ROAD_FOOTPATH_BRIDGE_M,
): MultiPolygon {
  if (road.length === 0 || !(bridgeM > 0)) return road;
  try {
    const roadGrow = offsetMultiPolygon(road, bridgeM);
    const footGrow = footpath.length > 0 ? offsetMultiPolygon(footpath, bridgeM) : [];
    const corridor = footGrow.length > 0 ? intersection(roadGrow, footGrow) : [];
    let merged = corridor.length > 0 ? union(road, corridor) : road;
    if (footpath.length > 0) merged = difference(merged, footpath);
    if (blockers.length > 0) merged = difference(merged, blockers);
    return merged.length > 0 ? merged : road;
  } catch {
    return road;
  }
}

/** Ignore sliver median fragments from boolean noise (m²). */
export const GREEN_ON_ROAD_MIN_M2 = 2;

function multiToPtRings(multi: MultiPolygon): Pt[][][] {
  const out: Pt[][][] = [];
  for (const polygon of multi) {
    const rings: Pt[][] = [];
    for (const ring of polygon) {
      if (!ring || ring.length < 4) continue;
      rings.push(ring.map((p): Pt => [p[0], p[1]]));
    }
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

export function splitGreenForRoadLayer(
  green: Pt[][][],
  road: MultiPolygon,
): { green: Pt[][][]; greenOnRoad: Pt[][][] } {
  if (road.length === 0) return { green, greenOnRoad: [] };
  const allGreen = unionBlockers(green);
  if (allGreen.length === 0) return { green, greenOnRoad: [] };
  let hit: MultiPolygon;
  try {
    hit = intersection(allGreen, road);
  } catch {
    return { green, greenOnRoad: [] };
  }
  const greenOnRoad: Pt[][][] = [];
  for (const polygon of hit) {
    const outer = polygon[0];
    if (!outer) continue;
    if (ringArea(outer.slice(0, -1)) < GREEN_ON_ROAD_MIN_M2) continue;
    greenOnRoad.push(...multiToPtRings([polygon]));
  }
  return { green, greenOnRoad };
}
