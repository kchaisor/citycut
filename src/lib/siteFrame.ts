import type { Polygon } from "./safePolygonClip";
import { cleanRingForFrame, clipIntersection } from "./safePolygonClip";
import { clipPolygonRect, clipPolyline, clipPolylineRect, type AxisRect } from "./clip";
import type { Pt, Ring } from "../types";

export type SiteFrameShape = "square" | "circle" | "a3";

export const DEFAULT_SITE_FRAME_SHAPE: SiteFrameShape = "square";

export const SITE_FRAME_CIRCLE_SEGMENTS = 128;

export type FrameGroundSize = {
  widthM: number;
  heightM: number;
};

export type SiteFrame = {
  sideM: number;
  shape: SiteFrameShape;
  widthM: number;
  heightM: number;
};

export const PLINTH_SHADOW_SPREAD = 1.5;

export function makeSiteFrame(
  sideM: number,
  shape: SiteFrameShape,
  size?: FrameGroundSize,
): SiteFrame {
  const ground = frameGroundSize(sideM, size?.widthM, size?.heightM);
  return { sideM, shape, widthM: ground.widthM, heightM: ground.heightM };
}

export function siteFrameGround(frame: SiteFrame): FrameGroundSize {
  return { widthM: frame.widthM, heightM: frame.heightM };
}

export function containsPoint(frame: SiteFrame, point: Pt, margin = 0): boolean {
  if (margin > 0) return pointInSiteFrameWithMargin(frame, point, margin);
  return pointInSiteFrame(point, frame.sideM, frame.shape, siteFrameGround(frame));
}

function pointInSiteFrameWithMargin(frame: SiteFrame, point: Pt, margin: number): boolean {
  const { halfW, halfH } = frameHalfExtents(frame.sideM, frame.shape, siteFrameGround(frame));
  if (frame.shape === "circle") {
    const r = halfW + margin;
    return point[0] * point[0] + point[1] * point[1] <= r * r + 0.001;
  }
  return Math.abs(point[0]) <= halfW + margin + 0.001 && Math.abs(point[1]) <= halfH + margin + 0.001;
}

export function clipLine(frame: SiteFrame, points: Pt[]): Pt[][] {
  return clipPolylineSiteFrame(points, frame.sideM, frame.shape, siteFrameGround(frame));
}

export function clipPolygon(frame: SiteFrame, ring: Pt[]): Pt[] {
  return clipPolygonSiteFrame(ring, frame.sideM, frame.shape, siteFrameGround(frame));
}

export function clipPolygonWithHoles(frame: SiteFrame, outer: Pt[], holes: Pt[][]): Pt[][] | null {
  return clipAreaToSiteFrame(outer, holes, frame.sideM, frame.shape, siteFrameGround(frame));
}

export function outline(frame: SiteFrame): Polygon {
  return siteFramePolygon(frame.sideM, frame.shape, siteFrameGround(frame));
}

export function plinthShadowExtents(frame: SiteFrame, spread = PLINTH_SHADOW_SPREAD): {
  widthM: number;
  heightM: number;
} {
  return { widthM: frame.widthM * spread, heightM: frame.heightM * spread };
}

export function frameGroundSize(sideM: number, widthM?: number, heightM?: number): FrameGroundSize {
  const width = widthM ?? sideM;
  const height = heightM ?? sideM;
  return { widthM: width, heightM: height };
}

export function readSiteFrameShape(raw: string | null): SiteFrameShape {
  const value = raw?.trim().toLowerCase();
  if (value === "circle") return "circle";
  if (value === "a3") return "a3";
  return "square";
}

export function siteFrameHalf(sideM: number): number {
  return sideM / 2;
}

export function frameHalfExtents(sideM: number, shape: SiteFrameShape, size?: FrameGroundSize): { halfW: number; halfH: number } {
  const ground = size ?? frameGroundSize(sideM);
  if (shape === "circle") {
    const half = siteFrameHalf(sideM);
    return { halfW: half, halfH: half };
  }
  return { halfW: ground.widthM / 2, halfH: ground.heightM / 2 };
}

export function pointInSiteFrame(
  point: Pt,
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  size?: FrameGroundSize,
): boolean {
  const { halfW, halfH } = frameHalfExtents(sideM, shape, size);
  if (shape === "circle") {
    return point[0] * point[0] + point[1] * point[1] <= halfW * halfW + 0.001;
  }
  return Math.abs(point[0]) <= halfW + 0.001 && Math.abs(point[1]) <= halfH + 0.001;
}

export function circleRing(radius: number, segments = SITE_FRAME_CIRCLE_SEGMENTS): Ring {
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

function frameClipPolygon(sideM: number, shape: SiteFrameShape, size?: FrameGroundSize): Polygon {
  const { halfW, halfH } = frameHalfExtents(sideM, shape, size);
  if (shape === "square" || shape === "a3") {
    return [
      [
        [-halfW, -halfH],
        [halfW, -halfH],
        [halfW, halfH],
        [-halfW, halfH],
        [-halfW, -halfH],
      ],
    ];
  }
  return [closeForClip(circleRing(halfW))];
}

export function clipAreaToSiteFrame(
  outer: Pt[],
  holes: Pt[][],
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  size?: FrameGroundSize,
): Pt[][] | null {
  const { halfW, halfH } = frameHalfExtents(sideM, shape, size);
  const clippedOuter = clipPolygonRect(cleanRingForFrame(outer), halfW, halfH);
  if (clippedOuter.length < 3) return null;
  const clippedHoles = holes
    .map((hole) => clipPolygonRect(cleanRingForFrame(hole), halfW, halfH))
    .filter((hole) => hole.length >= 3);
  if (shape === "square" || shape === "a3") return [clippedOuter, ...clippedHoles];
  const subject: Polygon = [closeForClip(clippedOuter), ...clippedHoles.map((hole) => closeForClip(hole))];
  try {
    const result = clipIntersection(subject, frameClipPolygon(sideM, "circle"), {
      layer: "site frame",
      operation: "intersection",
    });
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
  size?: FrameGroundSize,
): Pt[] {
  const rings = clipAreaToSiteFrame(ring, [], sideM, shape, size);
  return rings?.[0] ?? [];
}

function frameAxisRect(sideM: number, shape: SiteFrameShape, size?: FrameGroundSize): AxisRect {
  const { halfW, halfH } = frameHalfExtents(sideM, shape, size);
  return { minE: -halfW, maxE: halfW, minN: -halfH, maxN: halfH };
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
  size?: FrameGroundSize,
): Pt[][] {
  const rect = frameAxisRect(sideM, shape, size);
  const squareParts =
    shape === "square" && (!size || (size.widthM === sideM && size.heightM === sideM))
      ? clipPolyline(points, -sideM / 2, sideM / 2)
      : clipPolylineRect(points, rect);
  if (shape === "square" || shape === "a3") return squareParts;
  const half = siteFrameHalf(sideM);
  return squareParts.flatMap((part) => clipPolylineToCircle(part, half));
}

export function siteFramePolygon(
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  size?: FrameGroundSize,
): Polygon {
  return frameClipPolygon(sideM, shape, size);
}

export function siteFrameAreaM2(
  sideM: number,
  shape: SiteFrameShape,
  size?: FrameGroundSize,
): number {
  if (shape === "circle") return Math.PI * (sideM / 2) ** 2;
  const ground = size ?? frameGroundSize(sideM);
  return ground.widthM * ground.heightM;
}
