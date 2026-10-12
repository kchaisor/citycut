import { signedArea } from "./geo";
import { pointInSiteFrame, type SiteFrameShape } from "./siteFrame";
import type { AreaFeat, Pt } from "../types";

/**
 * Roundabouts in the Overture road network, and their centre islands.
 *
 * Overture carries no junction tag, and its z14 tiles cut an OSM junction=roundabout ring into
 * 2–3 vertex segments, so the ring (and the island the road union leaves inside it) is a coarse
 * polygon. The island polygon itself, when OSM maps one (landuse=grass, leisure=garden), is either
 * simplified to ~8 vertices in the z13 base tiles or absent. With no green inside, the plan median
 * fill paints the hole as road and the island disappears.
 *
 * Cheap fix, no general arc smoothing: group segments by their OSM way, keep groups that close into
 * a small near-circular loop, fit one circle, and redraw that ring and its island with a fixed
 * segment count.
 */

/** Vertices in a redrawn roundabout ring or island. */
export const ROUNDABOUT_SEGMENTS = 48;
/** Centreline radius limits for a roundabout (m). Larger loops are left alone. */
export const ROUNDABOUT_MIN_R_M = 3;
export const ROUNDABOUT_MAX_R_M = 40;
/** Largest allowed radial deviation from the fitted circle, as a share of the radius. */
const MAX_RADIAL_DEVIATION = 0.25;
/** Largest angular gap in the ring's vertices (radians); a closed ring has none. */
const MAX_ANGULAR_GAP = Math.PI / 2.5;
/** Islands smaller than this radius are not drawn (m). */
export const ISLAND_MIN_R_M = 1.5;

export type Roundabout = { center: Pt; radius: number; width: number; key: string };

/** OSM way key ("w32921419") of an Overture segment, from its `sources` record id. */
export function osmWayKey(props: Record<string, unknown>): string | null {
  const raw = props.sources;
  if (typeof raw !== "string" || !raw.includes("record_id")) return null;
  const match = /"record_id"\s*:\s*"(w\d+)/.exec(raw);
  return match ? match[1]! : null;
}

/** Least-squares (Kåsa) circle through points; null when degenerate. */
export function fitCircle(points: Pt[]): { center: Pt; radius: number } | null {
  const n = points.length;
  if (n < 3) return null;
  let mx = 0, my = 0;
  for (const [x, y] of points) {
    mx += x / n;
    my += y / n;
  }
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of points) {
    const u = x - mx;
    const v = y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const a = (suuu + suvv) / 2;
  const b = (svvv + svuu) / 2;
  const uc = (a * svv - b * suv) / det;
  const vc = (b * suu - a * suv) / det;
  const radius = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return { center: [mx + uc, my + vc], radius };
}

/** Circle as a closed ring (first point repeated), counter-clockwise. */
export function circleRing(center: Pt, radius: number, segments = ROUNDABOUT_SEGMENTS): Pt[] {
  const ring: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    ring.push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
  }
  ring.push([ring[0]![0], ring[0]![1]]);
  return ring;
}

/** True when the points lie near one circle all the way round. */
export function nearCircle(points: Pt[], fit: { center: Pt; radius: number }, maxDeviation = MAX_RADIAL_DEVIATION): boolean {
  const { center, radius } = fit;
  const angles: number[] = [];
  for (const p of points) {
    const d = Math.hypot(p[0] - center[0], p[1] - center[1]);
    if (Math.abs(d - radius) > maxDeviation * radius) return false;
    angles.push(Math.atan2(p[1] - center[1], p[0] - center[0]));
  }
  angles.sort((x, y) => x - y);
  let gap = angles[0]! + Math.PI * 2 - angles[angles.length - 1]!;
  for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i]! - angles[i - 1]!);
  return gap <= MAX_ANGULAR_GAP;
}

/**
 * Roundabouts among road parts that share an OSM way key. A group qualifies when its vertices fit
 * a circle of radius ROUNDABOUT_MIN_R_M..MAX within MAX_RADIAL_DEVIATION and close all the way round.
 */
export function detectRoundabouts(parts: { key: string | null; line: Pt[]; width: number }[]): Roundabout[] {
  const groups = new Map<string, { points: Pt[]; width: number }>();
  for (const part of parts) {
    if (!part.key) continue;
    const group = groups.get(part.key) ?? { points: [], width: 0 };
    group.points.push(...part.line);
    group.width = Math.max(group.width, part.width);
    groups.set(part.key, group);
  }
  const out: Roundabout[] = [];
  for (const [key, group] of groups) {
    if (group.points.length < 4) continue;
    const fit = fitCircle(group.points);
    if (!fit || fit.radius < ROUNDABOUT_MIN_R_M || fit.radius > ROUNDABOUT_MAX_R_M) continue;
    if (!nearCircle(group.points, fit)) continue;
    out.push({ key, center: fit.center, radius: fit.radius, width: group.width });
  }
  return out;
}

function centroid(ring: Pt[]): Pt {
  const pts = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  let x = 0, y = 0;
  for (const p of pts) {
    x += p[0] / pts.length;
    y += p[1] / pts.length;
  }
  return [x, y];
}

/**
 * Replace each roundabout's mapped island (a near-circular green area inside the ring) with a
 * smooth circle of the same area, and add a circle where no island is mapped (radius = ring radius
 * less half the carriageway). Other areas pass through untouched.
 */
export function withRoundaboutIslands(
  areas: AreaFeat[],
  roundabouts: Roundabout[],
  frame?: { sideM: number; shape: SiteFrameShape },
): AreaFeat[] {
  if (roundabouts.length === 0) return areas;
  const drop = new Set<AreaFeat>();
  const added: AreaFeat[] = [];
  for (const rb of roundabouts) {
    const inner = rb.radius - rb.width / 2;
    let radius = inner;
    for (const area of areas) {
      if (area.kind !== "green" || drop.has(area) || area.holes.length > 0) continue;
      const c = centroid(area.ring);
      if (Math.hypot(c[0] - rb.center[0], c[1] - rb.center[1]) > rb.radius * 0.4) continue;
      const pts = area.ring;
      if (pts.some((p) => Math.hypot(p[0] - rb.center[0], p[1] - rb.center[1]) > rb.radius)) continue;
      // Mapped island: keep its size, drop its facets.
      radius = Math.sqrt(Math.abs(signedArea(pts)) / Math.PI);
      drop.add(area);
    }
    if (radius < ISLAND_MIN_R_M) continue;
    const ring = circleRing(rb.center, radius);
    // Areas are clipped to the frame upstream; an island the frame cuts is left out, not overhung.
    if (frame && ring.some((p) => !pointInSiteFrame(p, frame.sideM, frame.shape))) {
      for (const area of areas) if (drop.has(area) && Math.hypot(centroid(area.ring)[0] - rb.center[0], centroid(area.ring)[1] - rb.center[1]) <= rb.radius * 0.4) drop.delete(area);
      continue;
    }
    added.push({
      id: -1_000_000 - added.length,
      kind: "green",
      ring,
      holes: [],
    });
  }
  // A mapped island whose ring is cut by the site frame, or whose roundabout is, is still smoothed
  // when the island ring itself is near-circular.
  const rest = areas.filter((area) => !drop.has(area)).map((area) => smoothIslandRing(area));
  return [...rest, ...added];
}

/** Small green areas at or below this size are island candidates for smoothing (m²). */
export const ISLAND_MAX_M2 = 1200;

/** Replace a small, near-circular green ring with a circle of the same area; otherwise unchanged. */
export function smoothIslandRing(area: AreaFeat): AreaFeat {
  if (area.kind !== "green" || area.holes.length > 0 || area.ring.length < 6) return area;
  const size = Math.abs(signedArea(area.ring));
  if (size > ISLAND_MAX_M2 || size < Math.PI * ISLAND_MIN_R_M ** 2) return area;
  const fit = fitCircle(area.ring);
  if (!fit || !nearCircle(area.ring, fit, 0.15)) return area;
  return { ...area, ring: circleRing(fit.center, Math.sqrt(size / Math.PI)) };
}
