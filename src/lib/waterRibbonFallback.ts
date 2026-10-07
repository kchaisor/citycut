import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { bufferOpenLine } from "./bufferLine";
import { openRing, polylineLength } from "./geo";
import { waterLineHalfWidthM } from "./overtureBaseMapping";
import { stableNumericId } from "./overtureTiles";
import { pointInPolygon } from "./useCascade";
import type { AreaFeat, Pt, Ring } from "../types";

type ClipFns = {
  difference: (subject: Polygon | MultiPolygon, ...clips: Array<Polygon | MultiPolygon>) => MultiPolygon;
  union: (...geoms: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.difference === "function") return loaded;
  if (loaded.default && typeof loaded.default.difference === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { difference, union } = clippingFns();

export type WaterCenterline = {
  id: string;
  line: Pt[];
  props: Record<string, unknown>;
};

function closeRing(ring: Ring): [number, number][] {
  const open = openRing(ring);
  if (open.length < 3) return open.map(([x, y]) => [x, y]);
  const pts = open.map(([x, y]) => [x, y] as [number, number]);
  pts.push([pts[0]![0], pts[0]![1]]);
  return pts;
}

function areaPolygon(area: AreaFeat): Polygon | null {
  const outer = closeRing(area.ring);
  if (outer.length < 4) return null;
  const holes = area.holes.map((hole) => closeRing(hole)).filter((hole) => hole.length >= 4);
  return [outer, ...holes];
}

function unionWaterPolygons(areas: AreaFeat[]): MultiPolygon | null {
  const polys = areas.map(areaPolygon).filter((p): p is Polygon => p !== null);
  if (polys.length === 0) return null;
  try {
    return union(...polys);
  } catch {
    return polys;
  }
}

function ringsFromClipResult(result: MultiPolygon): Ring[][] {
  const out: Ring[][] = [];
  for (const polygon of result) {
    if (polygon.length === 0) continue;
    const rings = polygon.map((ring) => ring.map(([x, y]) => [x, y] as Pt));
    out.push(rings);
  }
  return out;
}

function pointInWater(point: Pt, polygonWater: AreaFeat[]): boolean {
  return polygonWater.some((area) => pointInPolygon(point, area.ring, area.holes));
}

/** Keep only centreline runs whose points are not already inside a water polygon. */
export function centerlinePartsOutsideWater(line: Pt[], polygonWater: AreaFeat[]): Pt[][] {
  if (line.length < 2) return [];
  const parts: Pt[][] = [];
  let current: Pt[] = [];
  const flush = () => {
    if (current.length >= 2 && polylineLength(current) >= 1) parts.push(current);
    current = [];
  };
  for (let i = 0; i < line.length; i++) {
    const point = line[i]!;
    const inside = pointInWater(point, polygonWater);
    if (inside) {
      flush();
      continue;
    }
    if (current.length === 0) current.push(point);
    else {
      const prev = current[current.length - 1]!;
      if (i > 0 && pointInWater(prev, polygonWater) === false) {
        const a = line[i - 1]!;
        const b = point;
        if (pointInWater(a, polygonWater) !== pointInWater(b, polygonWater)) {
          const t = 0.5;
          const edge: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (!pointInWater(edge, polygonWater)) current.push(edge);
        }
      }
      current.push(point);
    }
  }
  flush();
  return parts;
}

const MIN_RIBBON_M2 = 4;

/**
 * Buffer centreline gaps only where merged water polygons do not already cover the channel.
 */
export function waterFallbackFromCenterlines(
  centerlines: WaterCenterline[],
  polygonWater: AreaFeat[],
): AreaFeat[] {
  const merged = unionWaterPolygons(polygonWater);
  const out: AreaFeat[] = [];
  for (const item of centerlines) {
    const uncoveredParts =
      polygonWater.length > 0 ? centerlinePartsOutsideWater(item.line, polygonWater) : [item.line];
    for (const part of uncoveredParts) {
      const half = waterLineHalfWidthM(item.props);
      const ribbon = bufferOpenLine(part, half);
      if (!ribbon || ribbon.length < 4) continue;
      let pieces: MultiPolygon = [[closeRing(ribbon)]];
      if (merged) {
        try {
          pieces = difference(pieces, merged);
        } catch {
          continue;
        }
      }
      for (const rings of ringsFromClipResult(pieces)) {
        if (rings.length === 0) continue;
        const outer = rings[0]!;
        if (outer.length < 3) continue;
        let area = 0;
        for (let i = 0; i < outer.length - 1; i++) {
          area += outer[i]![0] * outer[i + 1]![1] - outer[i + 1]![0] * outer[i]![1];
        }
        if (Math.abs(area / 2) < MIN_RIBBON_M2) continue;
        const holes = rings.slice(1);
        out.push({
          id: stableNumericId(`${item.id}:${out.length}`),
          kind: "water",
          ring: outer,
          holes,
        });
      }
    }
  }
  return out;
}
