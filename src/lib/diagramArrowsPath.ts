import type { Pt } from "../types";

export const PATH_EPS = 1e-6;

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function dedupePoints(points: readonly Pt[], minGapM = PATH_EPS): Pt[] {
  const out: Pt[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, point) > minGapM) out.push([point[0], point[1]]);
  }
  return out;
}

function reflect(a: Pt, b: Pt): Pt {
  return [2 * a[0] - b[0], 2 * a[1] - b[1]];
}

function catmullRomSegment(p0: Pt, p1: Pt, p2: Pt, p3: Pt, samples: number): Pt[] {
  const d1 = Math.sqrt(dist(p0, p1));
  const d2 = Math.sqrt(dist(p1, p2));
  const d3 = Math.sqrt(dist(p2, p3));
  const t0 = 0;
  const t1 = t0 + Math.max(d1, PATH_EPS);
  const t2 = t1 + Math.max(d2, PATH_EPS);
  const t3 = t2 + Math.max(d3, PATH_EPS);
  const out: Pt[] = [];
  for (let i = 1; i < samples; i += 1) {
    const t = t1 + ((t2 - t1) * i) / samples;
    const lerp = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
      const u = (t - ta) / (tb - ta);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
    const a1 = lerp(p0, p1, t0, t1);
    const a2 = lerp(p1, p2, t1, t2);
    const a3 = lerp(p2, p3, t2, t3);
    const b1 = lerp(a1, a2, t0, t2);
    const b2 = lerp(a2, a3, t1, t3);
    out.push(lerp(b1, b2, t1, t2));
  }
  return out;
}

export function smoothArrowPath(points: readonly Pt[], samplesPerSegment = 14): Pt[] {
  const clean = dedupePoints(points);
  if (clean.length < 2) return clean;
  if (clean.length === 2) return clean;
  const padded: Pt[] = [reflect(clean[0]!, clean[1]!), ...clean, reflect(clean[clean.length - 1]!, clean[clean.length - 2]!)];
  const out: Pt[] = [clean[0]!];
  for (let i = 1; i < padded.length - 2; i += 1) {
    out.push(...catmullRomSegment(padded[i - 1]!, padded[i]!, padded[i + 1]!, padded[i + 2]!, samplesPerSegment));
    out.push(padded[i + 1]!);
  }
  return out;
}

export function pathLength(path: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += dist(path[i - 1]!, path[i]!);
  return total;
}

export function pointAtDistance(path: readonly Pt[], distanceM: number): { point: Pt; dir: Pt } {
  if (path.length === 0) return { point: [0, 0], dir: [1, 0] };
  if (path.length === 1) return { point: path[0]!, dir: [1, 0] };
  let remaining = Math.max(0, distanceM);
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = dist(a, b);
    if (remaining <= len || i === path.length - 1) {
      const u = len > PATH_EPS ? Math.min(1, remaining / len) : 0;
      const dir: Pt = len > PATH_EPS ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
      return { point: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], dir };
    }
    remaining -= len;
  }
  return { point: path[path.length - 1]!, dir: [1, 0] };
}

export function subPath(path: readonly Pt[], fromM: number, toM: number): Pt[] {
  const total = pathLength(path);
  const start = Math.max(0, Math.min(fromM, total));
  const end = Math.max(start, Math.min(toM, total));
  if (end - start < PATH_EPS) return [];
  const out: Pt[] = [pointAtDistance(path, start).point];
  let walked = 0;
  for (let i = 1; i < path.length; i += 1) {
    walked += dist(path[i - 1]!, path[i]!);
    if (walked > start + PATH_EPS && walked < end - PATH_EPS) out.push(path[i]!);
  }
  out.push(pointAtDistance(path, end).point);
  return out;
}

export function subdividePath(path: readonly Pt[], maxStepM: number): Pt[] {
  if (path.length < 2 || maxStepM <= PATH_EPS) return [...path];
  const out: Pt[] = [path[0]!];
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const parts = Math.max(1, Math.ceil(dist(a, b) / maxStepM));
    for (let k = 1; k <= parts; k += 1) out.push([a[0] + ((b[0] - a[0]) * k) / parts, a[1] + ((b[1] - a[1]) * k) / parts]);
  }
  return out;
}

export function resamplePath(path: readonly Pt[], segments: number): Pt[] {
  const total = pathLength(path);
  if (path.length < 2 || total < PATH_EPS) return [...path];
  const out: Pt[] = [];
  for (let i = 0; i <= segments; i += 1) out.push(pointAtDistance(path, (total * i) / segments).point);
  return out;
}

export type ArrowHead = [Pt, Pt, Pt];

export function arrowHead(tip: Pt, dir: Pt, lengthM: number, halfWidthM: number): ArrowHead {
  const baseX = tip[0] - dir[0] * lengthM;
  const baseY = tip[1] - dir[1] * lengthM;
  const nx = -dir[1];
  const ny = dir[0];
  return [tip, [baseX + nx * halfWidthM, baseY + ny * halfWidthM], [baseX - nx * halfWidthM, baseY - ny * halfWidthM]];
}

export type ArrowRibbon = { left: Pt[]; right: Pt[]; alpha?: number[] };

function normalAt(path: readonly Pt[], i: number): Pt {
  const a = path[Math.max(0, i - 1)]!;
  const b = path[Math.min(path.length - 1, i + 1)]!;
  const len = dist(a, b);
  return len > PATH_EPS ? [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] : [0, 1];
}

export function ribbonFromProfile(path: readonly Pt[], halfWidths: readonly number[], alpha?: readonly number[]): ArrowRibbon | null {
  if (path.length < 2) return null;
  const left: Pt[] = [];
  const right: Pt[] = [];
  path.forEach((p, i) => {
    const half = halfWidths[i] ?? 0;
    const n = normalAt(path, i);
    left.push([p[0] + n[0] * half, p[1] + n[1] * half]);
    right.push([p[0] - n[0] * half, p[1] - n[1] * half]);
  });
  return alpha ? { left, right, alpha: [...alpha] } : { left, right };
}

export function ribbonAlong(path: readonly Pt[], halfWidthAt: (fraction: number) => number): ArrowRibbon | null {
  if (path.length < 2) return null;
  const total = pathLength(path);
  const halves: number[] = [];
  let walked = 0;
  for (let i = 0; i < path.length; i += 1) {
    if (i > 0) walked += dist(path[i - 1]!, path[i]!);
    halves.push(halfWidthAt(total > PATH_EPS ? walked / total : 0));
  }
  return ribbonFromProfile(path, halves);
}

export function ribbonPolygon(ribbon: ArrowRibbon): Pt[] {
  return [...ribbon.left, ...[...ribbon.right].reverse()];
}

export function arrowMidpoint(points: readonly Pt[]): Pt {
  const smooth = smoothArrowPath(points);
  if (smooth.length === 0) return [0, 0];
  return pointAtDistance(smooth, pathLength(smooth) / 2).point;
}

export function distanceToPath(path: readonly Pt[], at: Pt): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    const u = len2 > PATH_EPS ? Math.min(1, Math.max(0, ((at[0] - a[0]) * abx + (at[1] - a[1]) * aby) / len2)) : 0;
    best = Math.min(best, dist(at, [a[0] + abx * u, a[1] + aby * u]));
  }
  return best;
}

export function nearestPointIndex(points: readonly Pt[], at: Pt, toleranceM: number): number | null {
  let best: number | null = null;
  let bestDist = toleranceM;
  points.forEach((point, index) => {
    const d = dist(point, at);
    if (d <= bestDist) {
      bestDist = d;
      best = index;
    }
  });
  return best;
}

function hermiteTangents(knots: readonly number[], heights: readonly number[]): number[] {
  const n = heights.length;
  const slope = (i: number) => (heights[i + 1]! - heights[i]!) / Math.max(knots[i + 1]! - knots[i]!, PATH_EPS);
  if (n === 1) return [0];
  const tangents: number[] = [slope(0)];
  for (let i = 1; i < n - 1; i += 1) {
    const before = slope(i - 1);
    const after = slope(i);
    if (before * after <= 0) {
      tangents.push(0);
      continue;
    }
    const h0 = knots[i]! - knots[i - 1]!;
    const h1 = knots[i + 1]! - knots[i]!;
    const w1 = 2 * h1 + h0;
    const w2 = h1 + 2 * h0;
    tangents.push((w1 + w2) / (w1 / before + w2 / after));
  }
  tangents.push(slope(n - 2));
  return tangents;
}

export function arrowElevationProfile(points: readonly Pt[], heights: readonly number[]): (east: number, north: number) => number {
  const keep: number[] = [];
  points.forEach((point, i) => {
    const last = keep[keep.length - 1];
    if (last === undefined || dist(points[last]!, point) > PATH_EPS) keep.push(i);
  });
  const clean = keep.map((i) => points[i]!);
  const levels = keep.map((i) => heights[i] ?? 0);
  if (clean.length < 2) {
    const only = levels[0] ?? 0;
    return () => only;
  }
  const samples = 14;
  const path = smoothArrowPath(clean, samples);
  const along: number[] = [0];
  for (let i = 1; i < path.length; i += 1) along.push(along[i - 1]! + dist(path[i - 1]!, path[i]!));
  const stride = clean.length === 2 ? 1 : samples;
  const knots = clean.map((_, j) => along[Math.min(j * stride, along.length - 1)]!);
  const tangents = hermiteTangents(knots, levels);

  const elevationAt = (s: number): number => {
    if (s <= knots[0]!) return levels[0]!;
    const last = knots.length - 1;
    if (s >= knots[last]!) return levels[last]!;
    let k = 0;
    while (k < last - 1 && s > knots[k + 1]!) k += 1;
    const h = knots[k + 1]! - knots[k]!;
    const t = (s - knots[k]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * levels[k]! +
      (t3 - 2 * t2 + t) * h * tangents[k]! +
      (-2 * t3 + 3 * t2) * levels[k + 1]! +
      (t3 - t2) * h * tangents[k + 1]!
    );
  };

  return (east, north) => {
    let best = Infinity;
    let bestS = 0;
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const len2 = abx * abx + aby * aby;
      const u = len2 > PATH_EPS ? Math.min(1, Math.max(0, ((east - a[0]) * abx + (north - a[1]) * aby) / len2)) : 0;
      const d = Math.hypot(east - (a[0] + abx * u), north - (a[1] + aby * u));
      if (d < best) {
        best = d;
        bestS = along[i - 1]! + u * Math.sqrt(len2);
      }
    }
    return elevationAt(bestS);
  };
}
