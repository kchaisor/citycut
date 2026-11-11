import { signedArea } from "./geo";
import { clipAreaToSiteFrame, type SiteFrameShape } from "./siteFrame";
import type { AreaFeat, Pt } from "../types";

export const ROUNDABOUT_SEGMENTS = 48;
export const ROUNDABOUT_MIN_R_M = 3;
export const ROUNDABOUT_MAX_R_M = 40;
const MAX_RADIAL_DEVIATION = 0.25;
const MAX_ANGULAR_GAP = Math.PI / 2.5;
export const ISLAND_MIN_R_M = 1.5;

export type Roundabout = { center: Pt; radius: number; width: number; key: string };

export function osmWayKey(props: Record<string, unknown>): string | null {
  const raw = props.sources;
  if (typeof raw !== "string" || !raw.includes("record_id")) return null;
  const match = /"record_id"\s*:\s*"(w\d+)/.exec(raw);
  return match ? match[1]! : null;
}

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

export function circleRing(center: Pt, radius: number, segments = ROUNDABOUT_SEGMENTS): Pt[] {
  const ring: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    ring.push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
  }
  ring.push([ring[0]![0], ring[0]![1]]);
  return ring;
}

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

export const ROUNDABOUT_ISLAND_ESTIMATE_NOTE = "Roundabout island (estimate): no island in the loaded map data (OpenStreetMap via Overture), inferred from the road ring";

export function withRoundaboutIslands(
  areas: AreaFeat[],
  roundabouts: Roundabout[],
  frame?: { sideM: number; shape: SiteFrameShape },
): AreaFeat[] {
  if (roundabouts.length === 0) return areas;
  const replaced = new Map<AreaFeat, AreaFeat | null>();
  const added: AreaFeat[] = [];
  const fitFrame = (ring: Pt[]): Pt[] | null => {
    if (!frame) return ring;
    const rings = clipAreaToSiteFrame(ring.slice(0, -1), [], frame.sideM, frame.shape);
    const outer = rings?.[0];
    if (!outer || outer.length < 3) return null;
    const first = outer[0]!, last = outer.at(-1)!;
    return first[0] === last[0] && first[1] === last[1] ? outer : [...outer, [first[0], first[1]]];
  };
  for (const rb of roundabouts) {
    let mapped = false;
    for (const area of areas) {
      if (area.kind !== "green" || replaced.has(area) || area.holes.length > 0) continue;
      const c = centroid(area.ring);
      if (Math.hypot(c[0] - rb.center[0], c[1] - rb.center[1]) > rb.radius * 0.4) continue;
      if (area.ring.some((p) => Math.hypot(p[0] - rb.center[0], p[1] - rb.center[1]) > rb.radius)) continue;
      mapped = true;
      const radius = Math.sqrt(Math.abs(signedArea(area.ring)) / Math.PI);
      const ring = radius >= ISLAND_MIN_R_M ? fitFrame(circleRing(rb.center, radius)) : null;
      replaced.set(area, ring ? { ...area, ring } : area);
    }
    if (mapped) continue;
    const radius = rb.radius - rb.width / 2;
    if (radius < ISLAND_MIN_R_M) continue;
    const ring = fitFrame(circleRing(rb.center, radius));
    if (!ring) continue;
    added.push({ id: -1_000_000 - added.length, kind: "green", ring, holes: [], estimate: "roundabout-island" });
  }
  return [...areas.map((area) => replaced.get(area) ?? area), ...added];
}

export function estimatedIslandCount(areas: AreaFeat[]): number {
  return areas.filter((area) => area.estimate === "roundabout-island").length;
}
