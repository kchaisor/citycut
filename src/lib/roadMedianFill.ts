import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";
import { signedArea } from "./geo";
import type { Pt } from "../types";

type ClipFns = Pick<typeof import("polygon-clipping"), "intersection" | "union">;
const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
const clip: ClipFns = typeof loaded.intersection === "function" ? loaded : loaded.default!;

/** Road-surface holes at or below this area are medians, islands or join gaps, not city blocks (m²). */
export const ROAD_MEDIAN_HOLE_MAX_M2 = 1200;

/**
 * A gap is only a median or island when at least this share of its rim runs along a street
 * (any carriageway that is not a service way). Car-park bays and service loops are rimmed by
 * service ways and stay ground (Dandenong, 40 Cleeland St).
 */
export const MEDIAN_STREET_RIM_MIN = 0.5;
/** Slack beyond a street's half width when testing whether a rim point lies on that street (m). */
const RIM_SLACK_M = 2;
/** Rim sample spacing (m). */
const RIM_STEP_M = 1;

type Box = [number, number, number, number];
export type MedianStreet = { line: Pt[]; width: number };

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

function segmentDistance(p: Pair, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Share of the hole rim (by length) lying on a street's carriageway edge. */
export function streetRimShare(hole: Ring, streets: { line: Pt[]; width: number; box: Box }[]): number {
  const box = boxOf(hole);
  const near = streets.filter((s) => overlaps(s.box, [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1]));
  let total = 0;
  let onStreet = 0;
  for (let i = 0; i + 1 < hole.length; i++) {
    const a = hole[i]!;
    const b = hole[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / RIM_STEP_M));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p: Pair = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      total += len / n;
      const hit = near.some((s) => {
        const reach = s.width / 2 + RIM_SLACK_M;
        for (let j = 0; j + 1 < s.line.length; j++) if (segmentDistance(p, s.line[j]!, s.line[j + 1]!) <= reach) return true;
        return false;
      });
      if (hit) onStreet += len / n;
    }
  }
  return total > 0 ? onStreet / total : 0;
}

function toPolygon(rings: Pt[][]): Polygon {
  return rings.map((ring) => ring.map((p): Pair => [p[0], p[1]]));
}

/**
 * Fill the small holes in the plan road surface (paper showing between a median or island and the
 * carriageway) with road, leaving green, water and footpaths in the hole visible. Holes that touch a
 * building stay as they are. When `streets` is given, a hole is only filled if at least
 * MEDIAN_STREET_RIM_MIN of its rim runs along a street, so car-park bays between service ways or
 * aisles stay ground. Plan-only: 3D, .3dm and city blocks use their own unions.
 */
export function fillRoadMedianGaps(
  road: MultiPolygon,
  keep: { green: Pt[][][]; water: Pt[][][]; paths: MultiPolygon; buildings: Pt[][][] },
  maxHoleM2 = ROAD_MEDIAN_HOLE_MAX_M2,
  streets?: MedianStreet[],
): MultiPolygon {
  const streetIndex = streets
    ?.filter((s) => s.line.length >= 2 && s.width > 0)
    .map((s) => {
      const b = boxOf(s.line.map((p): Pair => [p[0], p[1]]));
      const r = s.width / 2 + RIM_SLACK_M;
      return { ...s, box: [b[0] - r, b[1] - r, b[2] + r, b[3] + r] as Box };
    });
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
      if (
        !small ||
        nearBuildings.some((building) => clip.intersection([hole], building).length > 0) ||
        (streetIndex && streetRimShare(hole, streetIndex) < MEDIAN_STREET_RIM_MIN)
      ) {
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
