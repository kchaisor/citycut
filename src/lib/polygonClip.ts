export type { MultiPolygon, Polygon } from "./safePolygonClip";
export { clipDifference, clipIntersection, clipUnion, isPolygonClipTopologyError } from "./safePolygonClip";

import type { MultiPolygon, Polygon } from "./safePolygonClip";
import { clipUnion } from "./safePolygonClip";

export function clipUnionAll(parts: Array<Polygon | MultiPolygon>): MultiPolygon {
  if (parts.length === 0) return [];
  let acc: MultiPolygon = [];
  for (const part of parts) {
    const next = part as MultiPolygon;
    acc = acc.length === 0 ? next : clipUnion(acc, next);
  }
  return acc;
}