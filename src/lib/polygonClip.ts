import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";

const EMPTY: MultiPolygon = [];

type ClipGeom = Polygon | MultiPolygon;

function asMulti(result: MultiPolygon | undefined): MultiPolygon {
  return Array.isArray(result) ? result : EMPTY;
}

export function clipDifference(subject: ClipGeom, clip: ClipGeom): MultiPolygon {
  if (!Array.isArray(clip) || clip.length === 0) return asMulti(subject as MultiPolygon);
  try {
    return asMulti(polygonClipping.difference(subject, clip));
  } catch {
    return asMulti(subject as MultiPolygon);
  }
}

export function clipUnion(a: ClipGeom, b: ClipGeom): MultiPolygon {
  try {
    return asMulti(polygonClipping.union(a, b));
  } catch {
    const left = asMulti(a as MultiPolygon);
    const right = asMulti(b as MultiPolygon);
    return [...left, ...right];
  }
}

export function clipUnionAll(parts: ClipGeom[]): MultiPolygon {
  if (parts.length === 0) return EMPTY;
  try {
    const [first, ...rest] = parts;
    return asMulti(polygonClipping.union(first, ...rest));
  } catch {
    return parts.reduce<MultiPolygon>((acc, part) => (acc.length === 0 ? asMulti(part as MultiPolygon) : clipUnion(acc, part)), EMPTY);
  }
}

export function clipIntersection(a: ClipGeom, b: ClipGeom): MultiPolygon {
  try {
    return asMulti(polygonClipping.intersection(a, b));
  } catch {
    return EMPTY;
  }
}

export function isPolygonClipTopologyError(message: string): boolean {
  return /Unable to complete output ring/i.test(message) || /Last matching segment found ends at/i.test(message);
}
