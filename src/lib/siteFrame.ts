import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { clipPolygon, clipPolyline } from "./clip";
import type { Pt, Ring } from "../types";

export type SiteFrameShape = "square" | "circle";

export const DEFAULT_SITE_FRAME_SHAPE: SiteFrameShape = "square";

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

export function readSiteFrameShape(raw: string | null): SiteFrameShape {
  const value = raw?.trim().toLowerCase();
  if (value === "circle") return "circle";
  return "square";
}

export function siteFrameHalf(sideM: number): number {
  return sideM / 2;
}

export function pointInSiteFrame(point: Pt, sideM: number, shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE): boolean {
  const half = siteFrameHalf(sideM);
  if (shape === "square") {
    return Math.abs(point[0]) <= half + 0.001 && Math.abs(point[1]) <= half + 0.001;
  }
  return point[0] * point[0] + point[1] * point[1] <= half * half + 0.001;
}

export function circleRing(radius: number, segments = 72): Ring {
  const ring: Ring = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    ring.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  ring.push(ring[0]!);
  return ring;
}

function closeForClip(ring: Ring): [number, number][] {
  const pts = ring.map(([x, y]) => [x, y] as [number, number]);
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0]!;
  const [bx, by] = pts[pts.length - 1]!;
  if (Math.hypot(ax - bx, ay - by) > 0.01) pts.push([ax, ay]);
  return pts;
}

function frameClipPolygon(sideM: number, shape: SiteFrameShape): Polygon {
  const half = siteFrameHalf(sideM);
  if (shape === "square") {
    return [
      [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
        [-half, -half],
      ],
    ];
  }
  return [closeForClip(circleRing(half))];
}

/** Clip one outer ring (and optional holes) to the site frame; returns outer plus hole rings. */
export function clipAreaToSiteFrame(
  outer: Pt[],
  holes: Pt[][],
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): Pt[][] | null {
  const half = siteFrameHalf(sideM);
  const clippedOuter = clipPolygon(outer, -half, half);
  if (clippedOuter.length < 3) return null;
  const clippedHoles = holes
    .map((hole) => clipPolygon(hole, -half, half))
    .filter((hole) => hole.length >= 3);
  if (shape === "square") return [clippedOuter, ...clippedHoles];
  const subject: Polygon = [closeForClip(clippedOuter), ...clippedHoles.map((hole) => closeForClip(hole))];
  try {
    const result = intersection(subject, frameClipPolygon(sideM, "circle"));
    if (result.length === 0 || result[0]!.length === 0) return null;
    const polygon = result[0]!;
    const rings = polygon
      .map((ring) => ring.map(([x, y]) => [x, y] as Pt))
      .filter((ring) => ring.length >= 3);
    return rings.length > 0 ? rings : null;
  } catch {
    return null;
  }
}

export function clipPolygonSiteFrame(
  ring: Pt[],
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): Pt[] {
  const rings = clipAreaToSiteFrame(ring, [], sideM, shape);
  return rings?.[0] ?? [];
}

function intersectSegmentCircle(a: Pt, b: Pt, radius: number): number[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fx = a[0];
  const fy = a[1];
  const A = dx * dx + dy * dy;
  if (A < 1e-12) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const sqrt = Math.sqrt(disc);
  const ts = [( -B - sqrt) / (2 * A), (-B + sqrt) / (2 * A)].filter((t) => t >= -1e-9 && t <= 1 + 1e-9);
  return [...new Set(ts.map((t) => Math.min(1, Math.max(0, t))))];
}

function pointOnSegment(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function clipPolylineToCircle(points: Pt[], radius: number): Pt[][] {
  const parts: Pt[][] = [];
  let current: Pt[] = [];
  const flush = () => {
    if (current.length >= 2) parts.push(current);
    current = [];
  };
  const inside = (p: Pt) => p[0] * p[0] + p[1] * p[1] <= radius * radius + 0.001;
  const same = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const aIn = inside(a);
    const bIn = inside(b);
    const ts = intersectSegmentCircle(a, b, radius).sort((x, y) => x - y);
    const splits: Pt[] = [];
    if (aIn) splits.push(a);
    for (const t of ts) {
      const hit = pointOnSegment(a, b, t);
      if (!splits.some((p) => same(p, hit))) splits.push(hit);
    }
    if (bIn && !splits.some((p) => same(p, b))) splits.push(b);
    if (splits.length === 0) {
      flush();
      continue;
    }
    if (splits.length === 1) {
      if (current.length === 0) current.push(splits[0]!);
      else if (!same(current[current.length - 1]!, splits[0]!)) {
        flush();
        current.push(splits[0]!);
      }
      continue;
    }
    for (let j = 0; j < splits.length - 1; j++) {
      const mid = pointOnSegment(splits[j]!, splits[j + 1]!, 0.5);
      if (!inside(mid)) continue;
      const run = [splits[j]!, splits[j + 1]!];
      if (current.length === 0) current.push(run[0]!);
      else if (!same(current[current.length - 1]!, run[0]!)) {
        flush();
        current.push(run[0]!);
      }
      if (!same(current[current.length - 1]!, run[1]!)) current.push(run[1]!);
    }
  }
  flush();
  return parts;
}

export function clipPolylineSiteFrame(
  points: Pt[],
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): Pt[][] {
  const half = siteFrameHalf(sideM);
  const squareParts = clipPolyline(points, -half, half);
  if (shape === "square") return squareParts;
  return squareParts.flatMap((part) => clipPolylineToCircle(part, half));
}

/** polygon-clipping frame for union/intersection helpers (figure-ground, roads). */
export function siteFramePolygon(sideM: number, shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE): Polygon {
  return frameClipPolygon(sideM, shape);
}

export function siteFrameAreaM2(sideM: number, shape: SiteFrameShape): number {
  if (shape === "circle") return Math.PI * (sideM / 2) ** 2;
  return sideM * sideM;
}
