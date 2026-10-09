import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";
import { signedArea } from "./geo";
import type { Pt } from "../types";

type ClipFns = Pick<typeof import("polygon-clipping"), "intersection" | "union">;
const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
const clip: ClipFns = typeof loaded.intersection === "function" ? loaded : loaded.default!;

/** Road-surface holes at or below this area are medians, islands or join gaps, not city blocks (m²). */
export const ROAD_MEDIAN_HOLE_MAX_M2 = 1200;

type Box = [number, number, number, number];

function boxOf(ring: Pair[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

const overlaps = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

function toPolygon(rings: Pt[][]): Polygon {
  return rings.map((ring) => ring.map((p): Pair => [p[0], p[1]]));
}

/**
 * Fill the small holes in the plan road surface (paper showing between a median or island and the
 * carriageway) with road, leaving green, water and footpaths in the hole visible. Holes that touch a
 * building stay as they are. Plan-only: 3D, .3dm and city blocks use their own unions.
 */
export function fillRoadMedianGaps(
  road: MultiPolygon,
  keep: { green: Pt[][][]; water: Pt[][][]; paths: MultiPolygon; buildings: Pt[][][] },
  maxHoleM2 = ROAD_MEDIAN_HOLE_MAX_M2,
): MultiPolygon {
  const index = (polys: Polygon[]) => polys.map((poly) => ({ poly, box: boxOf(poly[0] ?? []) }));
  const kept = index([...keep.green.map(toPolygon), ...keep.water.map(toPolygon), ...keep.paths]);
  const blockers = index(keep.buildings.map(toPolygon));
  const out: MultiPolygon = [];
  for (const polygon of road) {
    const [outer, ...holes] = polygon;
    if (!outer) continue;
    const nextHoles: Ring[] = [];
    for (const hole of holes) {
      const box = boxOf(hole);
      const small = Math.abs(signedArea(hole.slice(0, -1) as Pt[])) <= maxHoleM2;
      const nearBuildings = blockers.filter((b) => overlaps(b.box, box)).map((b) => b.poly);
      if (!small || nearBuildings.some((building) => clip.intersection([hole], building).length > 0)) {
        nextHoles.push(hole);
        continue;
      }
      const near = kept.filter((k) => overlaps(k.box, box)).map((k) => k.poly);
      // What stays visible inside the hole becomes the new hole(s); road fills the rest.
      const visible = near.length > 0 ? clip.intersection([hole], clip.union(near[0]!, ...near.slice(1))) : [];
      for (const piece of visible) {
        const [pieceOuter, ...islands] = piece;
        if (pieceOuter) nextHoles.push(pieceOuter);
        for (const island of islands) out.push([island]);
      }
    }
    out.push([outer, ...nextHoles]);
  }
  return out;
}
