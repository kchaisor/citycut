import { polylineLength } from "./geo";
import { pointInSiteFrame, type SiteFrameShape } from "./siteFrame";
import type { Pt, Ring } from "../types";

export const MASSING_DEFAULT_WIDTH_M = 14;
export const MASSING_DEFAULT_FLOORS = 4;
export const MASSING_FLOOR_HEIGHT_M = 3.1;
export const MASSING_ANGLE_SNAP_DEG = 5;
export const MASSING_ENDPOINT_SNAP_M = 1.5;
export const MASSING_MIN_CENTERLINE_M = 2;
export const MASSING_LOOP_CLOSE_M = 2.5;

export type MassingCenterline = readonly Pt[];

export type MassingBlock = {
  id: string;
  cutId: string;
  centerline: MassingCenterline;
  width_m: number;
  floors: number;
  floorHeight_m: number;
  flipped: boolean;
};

export type MassingSnapContext = {
  sideM: number;
  frameShape: SiteFrameShape;
  blocks: MassingBlock[];
  excludeBlockId?: string;
};

export function massingBlockHeight(block: Pick<MassingBlock, "floors" | "floorHeight_m">): number {
  return Math.max(MASSING_FLOOR_HEIGHT_M, block.floors * block.floorHeight_m);
}

export function centerlineLengthM(centerline: MassingCenterline): number {
  return polylineLength(centerline as Pt[]);
}

export function centerlineDirection(centerline: MassingCenterline): Pt {
  if (centerline.length < 2) return [1, 0];
  const a = centerline[centerline.length - 2]!;
  const b = centerline[centerline.length - 1]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

function perpAtPoint(from: Pt, to: Pt, at: Pt, half: number, flipped: boolean): [Pt, Pt] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sign = flipped ? -1 : 1;
  const px = -uy * sign;
  const py = ux * sign;
  const left: Pt = [at[0] + px * half, at[1] + py * half];
  const right: Pt = [at[0] - px * half, at[1] - py * half];
  return [left, right];
}

function intersectOffsetLines(a0: Pt, a1: Pt, b0: Pt, b1: Pt): Pt | null {
  const dax = a1[0] - a0[0];
  const day = a1[1] - a0[1];
  const dbx = b1[0] - b0[0];
  const dby = b1[1] - b0[1];
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b0[0] - a0[0]) * dby - (b0[1] - a0[1]) * dbx) / denom;
  return [a0[0] + t * dax, a0[1] + t * day];
}

export function footprintFromPolylineCenterline(
  vertices: readonly Pt[],
  widthM: number,
  flipped: boolean,
): Ring {
  const n = vertices.length;
  if (n < 2) return [];
  const half = widthM / 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      const [l, r] = perpAtPoint(vertices[0]!, vertices[1]!, vertices[0]!, half, flipped);
      left.push(l);
      right.push(r);
    } else if (i === n - 1) {
      const [l, r] = perpAtPoint(vertices[n - 2]!, vertices[n - 1]!, vertices[n - 1]!, half, flipped);
      left.push(l);
      right.push(r);
    } else {
      const prev = vertices[i - 1]!;
      const cur = vertices[i]!;
      const next = vertices[i + 1]!;
      const [lPrev] = perpAtPoint(prev, cur, prev, half, flipped);
      const [lCurIn] = perpAtPoint(prev, cur, cur, half, flipped);
      const [lCurOut] = perpAtPoint(cur, next, cur, half, flipped);
      const [lNext] = perpAtPoint(cur, next, next, half, flipped);
      const [, rPrev] = perpAtPoint(prev, cur, prev, half, flipped);
      const [, rCurIn] = perpAtPoint(prev, cur, cur, half, flipped);
      const [, rCurOut] = perpAtPoint(cur, next, cur, half, flipped);
      const [, rNext] = perpAtPoint(cur, next, next, half, flipped);
      const li = intersectOffsetLines(lPrev, lCurIn, lCurOut, lNext);
      const ri = intersectOffsetLines(rPrev, rCurIn, rCurOut, rNext);
      left.push(li ?? lCurIn);
      right.push(ri ?? rCurIn);
    }
  }
  const open = [...left, ...right.slice().reverse()];
  return open.length ? [...open, open[0]!] : [];
}

function footprintFromSegmentCenterline(
  centerline: readonly [Pt, Pt],
  widthM: number,
  flipped: boolean,
): Ring {
  const [a, b] = centerline;
  const half = widthM / 2;
  const [c0, c1] = perpAtPoint(a, b, a, half, flipped);
  const [c3, c2] = perpAtPoint(a, b, b, half, flipped);
  return [c0, c1, c2, c3, c0];
}

export function footprintFromCenterline(
  centerline: MassingCenterline,
  widthM: number,
  flipped: boolean,
): Ring {
  if (centerline.length < 2) return [];
  if (centerline.length === 2) {
    return footprintFromSegmentCenterline(centerline as readonly [Pt, Pt], widthM, flipped);
  }
  return footprintFromPolylineCenterline(centerline, widthM, flipped);
}

export function footprintCorners(centerline: MassingCenterline, widthM: number, flipped: boolean): Pt[] {
  const ring = footprintFromCenterline(centerline, widthM, flipped);
  return ring.slice(0, 4);
}

export function cutBoundarySegments(sideM: number, frameShape: SiteFrameShape): [Pt, Pt][] {
  const half = sideM / 2;
  if (frameShape === "circle") {
    const segments: [Pt, Pt][] = [];
    const n = 32;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      segments.push([
        [Math.cos(a0) * half, Math.sin(a0) * half],
        [Math.cos(a1) * half, Math.sin(a1) * half],
      ]);
    }
    return segments;
  }
  const corners: Pt[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < 4; i++) {
    out.push([corners[i]!, corners[(i + 1) % 4]!]);
  }
  return out;
}

export function cutBoundaryAnglesDeg(): number[] {
  return [0, 90, 180, 270];
}

function normAngleDeg(deg: number): number {
  let v = deg % 360;
  if (v < 0) v += 360;
  return v;
}

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(normAngleDeg(a) - normAngleDeg(b));
  return Math.min(d, 360 - d);
}

export function directionAngleDeg(dir: Pt): number {
  return normAngleDeg((Math.atan2(dir[1], dir[0]) * 180) / Math.PI);
}

export function snapAnglesDeg(ctx: MassingSnapContext): number[] {
  const angles = new Set<number>(cutBoundaryAnglesDeg());
  for (const block of ctx.blocks) {
    if (block.id === ctx.excludeBlockId) continue;
    const dir = centerlineDirection(block.centerline);
    const deg = directionAngleDeg(dir);
    angles.add(Math.round(deg));
    angles.add(Math.round(normAngleDeg(deg + 90)));
  }
  return [...angles];
}

export function snapDirection(rawDir: Pt, ctx: MassingSnapContext): Pt {
  const len = Math.hypot(rawDir[0], rawDir[1]);
  if (len < 1e-6) return [1, 0];
  const deg = directionAngleDeg(rawDir);
  let best = deg;
  let bestDiff = 180;
  for (const candidate of snapAnglesDeg(ctx)) {
    const diff = angleDiffDeg(deg, candidate);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  if (bestDiff > MASSING_ANGLE_SNAP_DEG) return [rawDir[0] / len, rawDir[1] / len];
  const rad = (best * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad)];
}

function distPointToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * dx;
  const qy = a[1] + t * dy;
  return Math.hypot(p[0] - qx, p[1] - qy);
}

export function distanceToCutBoundaryM(point: Pt, sideM: number, frameShape: SiteFrameShape): number {
  const segments = cutBoundarySegments(sideM, frameShape);
  let min = Infinity;
  for (const [a, b] of segments) {
    min = Math.min(min, distPointToSegment(point, a, b));
  }
  return min;
}

export function snapEndpoints(point: Pt, ctx: MassingSnapContext): Pt {
  const half = ctx.sideM / 2;
  const targets: Pt[] = [];
  if (ctx.frameShape === "square") {
    targets.push(
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
      [-half, 0],
      [half, 0],
      [0, -half],
      [0, half],
    );
  }
  for (const block of ctx.blocks) {
    if (block.id === ctx.excludeBlockId) continue;
    targets.push(...footprintCorners(block.centerline, block.width_m, block.flipped));
  }
  let best = point;
  let bestDist = MASSING_ENDPOINT_SNAP_M;
  for (const target of targets) {
    const d = Math.hypot(point[0] - target[0], point[1] - target[1]);
    if (d <= bestDist) {
      bestDist = d;
      best = target;
    }
  }
  const segments = cutBoundarySegments(ctx.sideM, ctx.frameShape);
  for (const [a, b] of segments) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q: Pt = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(point[0] - q[0], point[1] - q[1]);
    if (d <= bestDist) {
      bestDist = d;
      best = q;
    }
  }
  return best;
}

export function snapDrawEnd(start: Pt, rawEnd: Pt, ctx: MassingSnapContext): Pt {
  const snappedStart = snapEndpoints(start, ctx);
  const dirRaw: Pt = [rawEnd[0] - snappedStart[0], rawEnd[1] - snappedStart[1]];
  const dir = snapDirection(dirRaw, ctx);
  const len = Math.hypot(dirRaw[0], dirRaw[1]);
  const end: Pt = [snappedStart[0] + dir[0] * len, snappedStart[1] + dir[1] * len];
  return snapEndpoints(end, ctx);
}

export function footprintInsideCut(
  ring: Ring,
  sideM: number,
  frameShape: SiteFrameShape,
  epsilon = 0.05,
): boolean {
  for (let i = 0; i < ring.length - 1; i++) {
    const p = ring[i]!;
    if (!pointInSiteFrame(p, sideM, frameShape)) return false;
    if (frameShape === "circle") continue;
    const half = sideM / 2;
    if (Math.abs(p[0]) > half - epsilon || Math.abs(p[1]) > half - epsilon) {
      if (distanceToCutBoundaryM(p, sideM, frameShape) > epsilon) return false;
    }
  }
  return true;
}

export function blockFootprintInsideCut(block: MassingBlock, sideM: number, frameShape: SiteFrameShape): boolean {
  const ring = footprintFromCenterline(block.centerline, block.width_m, block.flipped);
  return footprintInsideCut(ring, sideM, frameShape);
}

export function createMassingBlock(
  cutId: string,
  centerline: MassingCenterline,
  partial?: Partial<Pick<MassingBlock, "width_m" | "floors" | "floorHeight_m" | "flipped">>,
): MassingBlock {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `mb-${Date.now()}`,
    cutId,
    centerline,
    width_m: partial?.width_m ?? MASSING_DEFAULT_WIDTH_M,
    floors: partial?.floors ?? MASSING_DEFAULT_FLOORS,
    floorHeight_m: partial?.floorHeight_m ?? MASSING_FLOOR_HEIGHT_M,
    flipped: partial?.flipped ?? false,
  };
}

export function duplicateMassingBlock(block: MassingBlock, cutId: string, offsetM = 4): MassingBlock {
  const shift: Pt = [offsetM, offsetM];
  const centerline: MassingCenterline = block.centerline.map(
    (pt) => [pt[0] + shift[0], pt[1] + shift[1]] as Pt,
  );
  return createMassingBlock(cutId, centerline, {
    width_m: block.width_m,
    floors: block.floors,
    floorHeight_m: block.floorHeight_m,
    flipped: block.flipped,
  });
}

export function snapFloorsFromHeight(heightM: number, floorHeightM: number): number {
  return Math.max(1, Math.round(heightM / floorHeightM));
}

export function blockCentroid(centerline: MassingCenterline): Pt {
  let sx = 0;
  let sy = 0;
  for (const pt of centerline) {
    sx += pt[0];
    sy += pt[1];
  }
  const n = centerline.length || 1;
  return [sx / n, sy / n];
}
