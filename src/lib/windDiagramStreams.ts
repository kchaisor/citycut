import * as THREE from "three";
import type { CityModel } from "../types";
import { downwindFromSector } from "./windRose";
import type { PrevailingStream, PrevailingStreamToken } from "./windPrevailingStreams";

export const STREAM_ROOF_CLEARANCE_M = 6;
export const STREAM_ROOF_PERCENTILE = 0.85;
export const STREAM_MIN_PLANE_M = 12;
export const STREAM_PERIOD_MIN_S = 6;
export const STREAM_PERIOD_MAX_S = 11;
export const STREAM_FADE_IN = 0.18;
export const STREAM_FADE_OUT = 0.22;
export const STREAM_RENDER_ORDER = 1030;
export const STREAM_SHAFT_STEPS = 22;
export const STREAM_VERTS_PER_ARROW = (STREAM_SHAFT_STEPS + 1) * 2 + 3;
export const STREAM_INDICES_PER_ARROW = STREAM_SHAFT_STEPS * 6 + 9;
export const STREAM_MESH_NAME = "WindStream";

const LEAD_LENGTH = 1.3;
const EDGE_INSET = 0.04;
const BAND_OFFSETS = [0, -0.32, 0.32, -0.64, 0.64] as const;
const COMFORTABLE_GAP = 0.24;
const OFFSET_COST = 0.03;
const OUTSIDE_COST = 4;
const PLACEMENT_SLIDE_ALLOWANCE = 0.1;
const PLACEMENT_SAMPLE_STRIDE = 3;
const TAIL_GAP = 0.062;
const HEAD_GAP = 0.105;
const NECK_HALF = 0.018;
const TAIL_HALF = 0.003;
const HEAD_HALF = 0.054;
const HEAD_LENGTH = 0.145;
const HEAD_MAX_SHARE = 0.4;
const RANK_WEIGHT = [1, 0.95, 0.9] as const;
const TAIL_FADE_SPAN = 0.2;
const TAIL_FADE_FLOOR = 0.45;
const COURSE_STEPS = STREAM_SHAFT_STEPS + 2;
const COURSE_MAX_RUN_STEPS = 600;
const RUN_OUT_EASE = 0.35;
const TRACK_CLEARANCE = 0.14;
const ENTRY_LENGTH_SHARE = 0.35;
const PERIOD_SPEED_PRODUCT = 28;
const FAN_PHASE_STEP = 0.21;
const SPREAD_GAP_KEEP = 0.75;
const SPREAD_WIDEN_STEPS = 6;
const LENGTH_KEEP_SLACK = 1e-9;

type ArrowPattern = { slot: number; length: number; lag: number; curl: number; sway: number; barb: number };
type FanPattern = { swoop: number; arrows: readonly ArrowPattern[] };

const TALL_CENTRE: FanPattern = {
  swoop: 0.04,
  arrows: [
    { slot: 0, length: 1, lag: 0, curl: 0, sway: 0.03, barb: 0.22 },
    { slot: -1, length: 0.76, lag: 0.05, curl: -0.1, sway: 0.012, barb: 0 },
    { slot: 1, length: 0.8, lag: 0.03, curl: 0.09, sway: 0.012, barb: 0.3 },
    { slot: -2, length: 0.5, lag: 0.1, curl: -0.18, sway: 0, barb: 0 },
    { slot: 2, length: 0.56, lag: 0.07, curl: 0.16, sway: 0, barb: 0.18 },
  ],
};

const SWOOP_AND_ECHOES: FanPattern = {
  swoop: 0.24,
  arrows: [
    { slot: 0, length: 1, lag: 0, curl: 0, sway: 0, barb: 0.28 },
    { slot: 1, length: 0.58, lag: 0.3, curl: 0.05, sway: 0, barb: 0 },
    { slot: 2, length: 0.34, lag: 0.5, curl: 0.12, sway: 0, barb: 0.2 },
    { slot: -1, length: 0.6, lag: 0.04, curl: -0.04, sway: 0.01, barb: 0 },
  ],
};

const LEANING_TRIO: FanPattern = {
  swoop: -0.16,
  arrows: [
    { slot: 0, length: 1, lag: 0, curl: 0, sway: 0, barb: 0.24 },
    { slot: -1, length: 0.66, lag: 0.04, curl: -0.06, sway: 0, barb: 0 },
    { slot: 1, length: 0.5, lag: 0.3, curl: 0.05, sway: 0, barb: 0.16 },
  ],
};

const FAN_PATTERNS = [TALL_CENTRE, SWOOP_AND_ECHOES, LEANING_TRIO] as const;

export type StreamPoint = { east: number; north: number };

export type StreamTrack = { points: Float32Array; cum: Float32Array; fromM: number; toM: number };

export type StreamArrowShape = { tailHalf: number; neckHalf: number; headHalf: number; headLength: number; barb: number };

export type StreamArrow = {
  rank: number;
  centre: StreamPoint[];
  positions: Float32Array;
  along: Float32Array;
  indices: Uint16Array;
  phase: number;
  track: StreamTrack;
  restTailM: number;
  lengthM: number;
  shape: StreamArrowShape;
};

export type StreamFan = {
  rank: number;
  sector: number;
  token: PrevailingStreamToken;
  band: number;
  periodS: number;
  arrows: StreamArrow[];
};

export type StreamSite = { halfWidthM: number; halfHeightM: number; spreadRadiusM?: number | null };

type StreamSpread = { halfE: number; halfN: number; scale: number; centred: boolean; radius?: number };

function streamSpread(site: StreamSite, unit: number): StreamSpread {
  const halfE = site.halfWidthM / unit;
  const halfN = site.halfHeightM / unit;
  const radius = site.spreadRadiusM;
  if (radius == null || !(radius > 0)) return { halfE, halfN, scale: 1, centred: false };
  const r = radius / unit;
  return { halfE: r, halfN: r, scale: r, centred: true, radius: r };
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function upwindEdgeDistance(band: number, flow: StreamPoint, side: StreamPoint, spread: StreamSpread): number {
  if (spread.radius != null) {
    const offset = Math.abs(band);
    if (offset >= spread.radius) return 0;
    return Math.sqrt(spread.radius * spread.radius - offset * offset);
  }
  const e = band * side.east;
  const n = band * side.north;
  const te = Math.abs(flow.east) > 1e-6 ? (spread.halfE + Math.sign(flow.east) * e) / Math.abs(flow.east) : Infinity;
  const tn = Math.abs(flow.north) > 1e-6 ? (spread.halfN + Math.sign(flow.north) * n) / Math.abs(flow.north) : Infinity;
  return Math.max(0, Math.min(te, tn));
}

export type StreamFanPlacement = { band: number; mirror: 1 | -1 };

type ArrowCourse = (t: number) => StreamPoint;

function fanCourses(stream: PrevailingStream, placement: StreamFanPlacement, spread: StreamSpread): ArrowCourse[] {
  const { mirror } = placement;
  const band = placement.band * spread.scale;
  const flow = downwindFromSector(stream.sector);
  const side = { east: -flow.north, north: flow.east };
  const fanLength = LEAD_LENGTH * stream.reach;
  const fromEdge = -upwindEdgeDistance(band, flow, side, spread) + EDGE_INSET * spread.scale;
  const start = spread.centred ? Math.min(fromEdge, -fanLength / 2) : fromEdge;
  const pattern = FAN_PATTERNS[stream.rank] ?? LEANING_TRIO;
  return pattern.arrows.slice(0, stream.arrows).map((arrow) => {
    const length = fanLength * arrow.length;
    const u0 = start + fanLength * arrow.lag;
    const restLateral = (t: number) => {
      const along = arrow.lag + arrow.length * t;
      return (
        arrow.slot * (TAIL_GAP + (HEAD_GAP - TAIL_GAP) * smooth(along)) +
        pattern.swoop * fanLength * along * along +
        arrow.curl * length * t * t +
        arrow.sway * Math.sin(Math.PI * 2 * t)
      );
    };
    const step = 1 / COURSE_STEPS;
    const entrySlope = (restLateral(step) - restLateral(0)) / (length * step);
    const exitSlope = (restLateral(1) - restLateral(1 - step)) / (length * step);
    const lateral = (t: number) => {
      if (t < 0) return restLateral(0) + entrySlope * RUN_OUT_EASE * (Math.exp((length * t) / RUN_OUT_EASE) - 1);
      if (t > 1) return restLateral(1) + exitSlope * RUN_OUT_EASE * (1 - Math.exp((-length * (t - 1)) / RUN_OUT_EASE));
      return restLateral(t);
    };
    return (t: number) => {
      const u = u0 + length * t;
      const v = band + mirror * lateral(t);
      return { east: u * flow.east + v * side.east, north: u * flow.north + v * side.north };
    };
  });
}

function courseStep(course: ArrowCourse, step: number): StreamPoint {
  return course(step / COURSE_STEPS);
}

function restLine(course: ArrowCourse): StreamPoint[] {
  return Array.from({ length: COURSE_STEPS + 1 }, (_, i) => courseStep(course, i));
}

function minGap(a: StreamPoint[][], b: StreamPoint[][], stride = 1): number {
  let best = Infinity;
  for (const lineA of a) {
    for (const lineB of b) {
      for (let i = 0; i < lineA.length; i += stride) {
        const p = lineA[i]!;
        for (let j = 0; j < lineB.length; j += stride) {
          const q = lineB[j]!;
          const de = p.east - q.east;
          const dn = p.north - q.north;
          const d = de * de + dn * dn;
          if (d < best) best = d;
        }
      }
    }
  }
  return Math.sqrt(best);
}

function overshoot(lines: StreamPoint[][], spread: StreamSpread): number {
  let worst = 0;
  for (const line of lines) {
    for (const p of line) {
      if (spread.radius != null) worst = Math.max(worst, Math.hypot(p.east, p.north) - spread.radius);
      else worst = Math.max(worst, Math.abs(p.east) - spread.halfE, Math.abs(p.north) - spread.halfN);
    }
  }
  return worst;
}

type StreamFanPlan = { spread: StreamSpread; placements: StreamFanPlacement[]; gap: number };

function placeStreamFans(streams: readonly PrevailingStream[], spread: StreamSpread): StreamFanPlan {
  const options = streams.map((stream) =>
    BAND_OFFSETS.flatMap((band) =>
      ([1, -1] as const).map((mirror) => {
        const placement: StreamFanPlacement = { band, mirror };
        const lines = fanCourses(stream, placement, spread).map(restLine);
        return { placement, lines, outside: overshoot(lines, spread) };
      }),
    ),
  );
  const gaps = new Map<string, number>();
  const gapBetween = (i: number, a: number, j: number, b: number) => {
    const key = `${i}.${a}.${j}.${b}`;
    let gap = gaps.get(key);
    if (gap === undefined) {
      gap = minGap(options[i]![a]!.lines, options[j]![b]!.lines, PLACEMENT_SAMPLE_STRIDE);
      gaps.set(key, gap);
    }
    return gap;
  };
  let bestScore = -Infinity;
  let bestGap = 0;
  let best = streams.map<StreamFanPlacement>(() => ({ band: 0, mirror: 1 }));
  const pick: number[] = [];
  const visit = (depth: number) => {
    if (depth === streams.length) {
      let gap = COMFORTABLE_GAP;
      let cost = 0;
      for (let i = 0; i < depth; i++) {
        const option = options[i]![pick[i]!]!;
        cost += Math.abs(option.placement.band) * OFFSET_COST * (streams.length - i);
        cost += Math.max(0, option.outside - PLACEMENT_SLIDE_ALLOWANCE) * OUTSIDE_COST;
        for (let j = i + 1; j < depth; j++) gap = Math.min(gap, gapBetween(i, pick[i]!, j, pick[j]!));
      }
      const score = gap - cost;
      if (score > bestScore) {
        bestScore = score;
        bestGap = gap;
        best = pick.map((choice, i) => options[i]![choice]!.placement);
      }
      return;
    }
    for (let choice = 0; choice < options[depth]!.length; choice++) {
      pick[depth] = choice;
      visit(depth + 1);
    }
  };
  visit(0);
  return { spread, placements: best, gap: bestGap };
}

type ClippedCourse = { points: StreamPoint[]; cum: number[]; restTail: number; length: number };
type CourseReach = { from: number; to: number };

function polylineLength(points: readonly StreamPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.east - points[i - 1]!.east, points[i]!.north - points[i - 1]!.north);
  return total;
}

function edgeCrossing(inside: StreamPoint, outside: StreamPoint, spread: StreamSpread): StreamPoint {
  const dx = outside.east - inside.east;
  const dy = outside.north - inside.north;
  let k = 1;
  if (spread.radius != null) {
    const r = spread.radius;
    const a = dx * dx + dy * dy;
    const b = 2 * (inside.east * dx + inside.north * dy);
    const c = inside.east * inside.east + inside.north * inside.north - r * r;
    const disc = b * b - 4 * a * c;
    if (a > 1e-12 && disc >= 0) {
      const s = Math.sqrt(disc);
      const roots = [(-b - s) / (2 * a), (-b + s) / (2 * a)].filter((root) => root >= 0 && root <= 1);
      if (roots.length > 0) k = Math.min(...roots);
    }
  } else {
    if (Math.abs(outside.east) > spread.halfE) k = Math.min(k, (Math.sign(outside.east) * spread.halfE - inside.east) / (outside.east - inside.east));
    if (Math.abs(outside.north) > spread.halfN) k = Math.min(k, (Math.sign(outside.north) * spread.halfN - inside.north) / (outside.north - inside.north));
  }
  return { east: inside.east + dx * k, north: inside.north + dy * k };
}

function clipCourse(course: ArrowCourse, spread: StreamSpread): ClippedCourse {
  const inside = (p: StreamPoint) =>
    spread.radius != null
      ? Math.hypot(p.east, p.north) <= spread.radius
      : Math.abs(p.east) <= spread.halfE && Math.abs(p.north) <= spread.halfN;
  const rest = restLine(course);
  const restLength = polylineLength(rest);
  let anchor = -1;
  for (let i = 0; i <= COURSE_STEPS; i++) {
    if (inside(rest[i]!) && (anchor < 0 || Math.abs(i - COURSE_STEPS / 2) < Math.abs(anchor - COURSE_STEPS / 2))) anchor = i;
  }
  let points: StreamPoint[];
  let restTailIndex = 0;
  if (anchor < 0) {
    points = rest.map((p) => {
      if (spread.radius != null) {
        const d = Math.hypot(p.east, p.north);
        if (d <= spread.radius || d === 0) return p;
        return { east: (p.east / d) * spread.radius, north: (p.north / d) * spread.radius };
      }
      return {
        east: Math.max(-spread.halfE, Math.min(spread.halfE, p.east)),
        north: Math.max(-spread.halfN, Math.min(spread.halfN, p.north)),
      };
    });
  } else {
    const upwind: StreamPoint[] = [];
    let firstStep = anchor;
    for (let i = anchor - 1; i >= anchor - COURSE_MAX_RUN_STEPS; i--) {
      const p = courseStep(course, i);
      if (!inside(p)) {
        upwind.push(edgeCrossing(upwind.at(-1) ?? rest[anchor]!, p, spread));
        break;
      }
      upwind.push(p);
      firstStep = i;
    }
    const downwind: StreamPoint[] = [rest[anchor]!];
    for (let i = anchor + 1; i <= anchor + COURSE_MAX_RUN_STEPS; i++) {
      const p = courseStep(course, i);
      if (!inside(p)) {
        downwind.push(edgeCrossing(downwind.at(-1)!, p, spread));
        break;
      }
      downwind.push(p);
    }
    restTailIndex = firstStep <= 0 ? upwind.length - (anchor - firstStep) - firstStep : 0;
    points = [...upwind.reverse(), ...downwind];
  }
  if (points.length < 2) points.push({ ...points[0]! });
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot(points[i]!.east - points[i - 1]!.east, points[i]!.north - points[i - 1]!.north));
  }
  const total = cum.at(-1)!;
  const length = Math.min(restLength, total);
  return { points, cum, length, restTail: Math.min(cum[restTailIndex]!, total - length) };
}

type StreamFanCourses = StreamFanPlan & { courses: ClippedCourse[][] };

function clipFans(streams: readonly PrevailingStream[], plan: StreamFanPlan, clipSpread = plan.spread): StreamFanCourses {
  const courses = streams.map((stream, i) =>
    fanCourses(stream, plan.placements[i]!, plan.spread).map((course) => clipCourse(course, clipSpread)),
  );
  return { ...plan, courses };
}

function keepsArrowLengths(plan: StreamFanCourses, open: StreamFanCourses): boolean {
  return plan.courses.every((fan, i) => fan.every((course, k) => course.length >= open.courses[i]![k]!.length - LENGTH_KEEP_SLACK));
}

function planStreamFans(streams: readonly PrevailingStream[], site: StreamSite): StreamFanCourses {
  const unit = Math.min(site.halfWidthM, site.halfHeightM);
  const halfE = site.halfWidthM / unit;
  const halfN = site.halfHeightM / unit;
  const cut: StreamSpread = { halfE, halfN, scale: 1, centred: false };
  const open = clipFans(streams, placeStreamFans(streams, cut));
  const wanted = streamSpread(site, unit);
  if (!wanted.centred) return open;
  const floor = streams.length < 2 ? 0 : open.gap * SPREAD_GAP_KEEP;
  const keepLength = (plan: StreamFanCourses): StreamFanCourses => ({
    ...plan,
    courses: plan.courses.map((fan, i) =>
      fan.map((course, k) => ({ ...course, length: Math.min(course.length, open.courses[i]![k]!.length) })),
    ),
  });
  if (wanted.radius != null && wanted.radius >= Math.min(halfE, halfN)) {
    const plan = clipFans(streams, placeStreamFans(streams, wanted));
    if (plan.gap >= floor && keepsArrowLengths(plan, open)) return keepLength(plan);
  }
  const pulled = placeStreamFans(streams, wanted);
  const pulledIn = clipFans(streams, pulled, cut);
  if (pulledIn.gap >= floor && keepsArrowLengths(pulledIn, open)) return keepLength(pulledIn);
  const inset = Math.min(halfE, halfN);
  for (let step = 1; step <= SPREAD_WIDEN_STEPS; step++) {
    const share = step / SPREAD_WIDEN_STEPS;
    const radius = wanted.radius! + (inset - wanted.radius!) * share;
    const spread: StreamSpread = { halfE: radius, halfN: radius, scale: radius, centred: true, radius };
    const plan = clipFans(streams, placeStreamFans(streams, spread), radius >= inset ? spread : cut);
    if (plan.gap >= floor && keepsArrowLengths(plan, open)) return keepLength(plan);
  }
  return open;
}

export function streamFanPlacements(streams: readonly PrevailingStream[], site: StreamSite): StreamFanPlacement[] {
  return planStreamFans(streams, site).placements;
}

function pointsWithin(courses: readonly ClippedCourse[], reaches: readonly CourseReach[]): StreamPoint[] {
  return courses.flatMap((course, i) => course.points.filter((_, j) => course.cum[j]! >= reaches[i]!.from && course.cum[j]! <= reaches[i]!.to));
}

function clearReach(course: ClippedCourse, others: readonly StreamPoint[]): CourseReach {
  const crowded = (p: StreamPoint) => {
    for (const q of others) {
      const de = p.east - q.east;
      const dn = p.north - q.north;
      if (de * de + dn * dn < TRACK_CLEARANCE * TRACK_CLEARANCE) return true;
    }
    return false;
  };
  const { points, cum, restTail } = course;
  const restTip = restTail + course.length;
  let to = cum.at(-1)!;
  for (let j = 0; j < points.length; j++) {
    if (cum[j]! > restTip && crowded(points[j]!)) {
      to = Math.max(restTip, cum[j - 1]!);
      break;
    }
  }
  let from = 0;
  for (let j = points.length - 1; j >= 0; j--) {
    if (cum[j]! < restTail && crowded(points[j]!)) {
      from = Math.min(restTail, cum[j + 1]!);
      break;
    }
  }
  return { from, to };
}

function fanReaches(fans: readonly ClippedCourse[][]): CourseReach[][] {
  let reaches = fans.map((fan) => fan.map<CourseReach>((course) => ({ from: course.restTail, to: course.restTail + course.length })));
  for (let pass = 0; pass < 2; pass++) {
    const settled = reaches;
    reaches = fans.map((fan, f) => {
      const others = fans.flatMap((other, g) => (g === f ? [] : pointsWithin(other, settled[g]!)));
      return fan.map((course) => clearReach(course, others));
    });
  }
  return reaches;
}

const ARROW_INDICES = (() => {
  const indices = new Uint16Array(STREAM_INDICES_PER_ARROW);
  let o = 0;
  for (let i = 0; i < STREAM_SHAFT_STEPS; i++) {
    const a = i * 2;
    indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], o);
    o += 6;
  }
  const neckLeft = STREAM_SHAFT_STEPS * 2;
  const neckRight = neckLeft + 1;
  const barbLeft = neckLeft + 2;
  const barbRight = neckLeft + 3;
  const tip = neckLeft + 4;
  indices.set([neckLeft, barbLeft, tip, neckLeft, tip, neckRight, neckRight, tip, barbRight], o);
  return indices;
})();

function trackSegment(track: StreamTrack, s: number, from: number): number {
  const last = track.cum.length - 2;
  let i = Math.min(from, last);
  while (i < last && track.cum[i + 1]! < s) i += 1;
  while (i > 0 && track.cum[i]! > s) i -= 1;
  return i;
}

export function streamTrackPoint(track: StreamTrack, s: number): StreamPoint {
  const i = trackSegment(track, s, 0);
  const span = track.cum[i + 1]! - track.cum[i]! || 1;
  const k = (s - track.cum[i]!) / span;
  return {
    east: track.points[i * 2]! + (track.points[i * 2 + 2]! - track.points[i * 2]!) * k,
    north: track.points[i * 2 + 1]! + (track.points[i * 2 + 3]! - track.points[i * 2 + 1]!) * k,
  };
}

export function writeStreamArrowOutline(
  track: StreamTrack,
  tailM: number,
  tipM: number,
  shape: StreamArrowShape,
  positions: Float32Array,
  along: Float32Array,
): void {
  const total = Math.max(tipM - tailM, 1e-6);
  const headLength = Math.min(shape.headLength, total * HEAD_MAX_SHARE);
  const headHalf = shape.headHalf * (headLength / shape.headLength);
  const neckShare = 1 - headLength / total;
  let segment = 0;
  let east = 0;
  let north = 0;
  let tangentEast = 0;
  let tangentNorth = 0;
  let v = 0;
  for (let i = 0; i <= STREAM_SHAFT_STEPS; i++) {
    const s = i / STREAM_SHAFT_STEPS;
    const share = s * neckShare;
    const at = tailM + total * share;
    segment = trackSegment(track, at, segment);
    const ae = track.points[segment * 2]!;
    const an = track.points[segment * 2 + 1]!;
    const de = track.points[segment * 2 + 2]! - ae;
    const dn = track.points[segment * 2 + 3]! - an;
    const span = track.cum[segment + 1]! - track.cum[segment]! || 1;
    const k = (at - track.cum[segment]!) / span;
    east = ae + de * k;
    north = an + dn * k;
    tangentEast = de / span;
    tangentNorth = dn / span;
    const half = shape.tailHalf + (shape.neckHalf - shape.tailHalf) * Math.pow(s, 1.5);
    positions[v * 2] = east - tangentNorth * half;
    positions[v * 2 + 1] = north + tangentEast * half;
    positions[v * 2 + 2] = east + tangentNorth * half;
    positions[v * 2 + 3] = north - tangentEast * half;
    along[v] = share;
    along[v + 1] = share;
    v += 2;
  }
  const sweep = headLength * shape.barb;
  const baseEast = east - tangentEast * sweep;
  const baseNorth = north - tangentNorth * sweep;
  positions[v * 2] = baseEast - tangentNorth * headHalf;
  positions[v * 2 + 1] = baseNorth + tangentEast * headHalf;
  positions[v * 2 + 2] = baseEast + tangentNorth * headHalf;
  positions[v * 2 + 3] = baseNorth - tangentEast * headHalf;
  along[v] = neckShare;
  along[v + 1] = neckShare;
  const tip = streamTrackPoint(track, tipM);
  positions[v * 2 + 4] = tip.east;
  positions[v * 2 + 5] = tip.north;
  along[v + 2] = 1;
}

export function streamTravelPeriodS(meanSpeedMs: number): number {
  if (!(meanSpeedMs > 0)) return STREAM_PERIOD_MAX_S;
  return Math.max(STREAM_PERIOD_MIN_S, Math.min(STREAM_PERIOD_MAX_S, PERIOD_SPEED_PRODUCT / meanSpeedMs));
}

export function layoutStreamFans(streams: readonly PrevailingStream[], site: StreamSite): StreamFan[] {
  if (streams.length === 0) return [];
  const unit = Math.min(site.halfWidthM, site.halfHeightM);
  const { spread, placements, courses } = planStreamFans(streams, site);
  const reaches = fanReaches(courses);
  return streams.map((stream, i) => {
    const pattern = FAN_PATTERNS[stream.rank] ?? LEANING_TRIO;
    const weight = RANK_WEIGHT[stream.rank] ?? 0.9;
    const arrows = courses[i]!.map((course, k) => {
      const spec = pattern.arrows[k]!;
      const scale = weight * (0.7 + 0.3 * spec.length * stream.reach) * unit;
      const shape: StreamArrowShape = {
        tailHalf: TAIL_HALF * scale,
        neckHalf: NECK_HALF * scale,
        headHalf: HEAD_HALF * scale,
        headLength: HEAD_LENGTH * scale,
        barb: spec.barb,
      };
      const track: StreamTrack = {
        points: Float32Array.from(course.points.flatMap((p) => [p.east * unit, p.north * unit])),
        cum: Float32Array.from(course.cum, (s) => s * unit),
        fromM: reaches[i]![k]!.from * unit,
        toM: reaches[i]![k]!.to * unit,
      };
      const restTailM = course.restTail * unit;
      const lengthM = course.length * unit;
      const positions = new Float32Array(STREAM_VERTS_PER_ARROW * 2);
      const along = new Float32Array(STREAM_VERTS_PER_ARROW);
      writeStreamArrowOutline(track, restTailM, restTailM + lengthM, shape, positions, along);
      const centre = Array.from({ length: COURSE_STEPS + 1 }, (_, j) => streamTrackPoint(track, restTailM + (lengthM * j) / COURSE_STEPS));
      const phase = (k / courses[i]!.length + stream.rank * FAN_PHASE_STEP) % 1;
      return { rank: stream.rank, centre, positions, along, indices: ARROW_INDICES, phase, track, restTailM, lengthM, shape };
    });
    return {
      rank: stream.rank,
      sector: stream.sector,
      token: stream.token,
      band: placements[i]!.band * spread.scale * unit,
      periodS: streamTravelPeriodS(stream.meanSpeedMs),
      arrows,
    };
  });
}

export function streamArrowCount(fans: readonly StreamFan[]): number {
  return fans.reduce((sum, fan) => sum + fan.arrows.length, 0);
}

export function streamFanClearanceM(fans: readonly StreamFan[]): number {
  let best = Infinity;
  for (let i = 0; i < fans.length; i++) {
    for (let j = i + 1; j < fans.length; j++) {
      best = Math.min(best, minGap(fans[i]!.arrows.map((a) => a.centre), fans[j]!.arrows.map((a) => a.centre)));
    }
  }
  return best;
}

export function streamPlaneHeightM(buildingHeights: readonly number[]): number {
  const heights = buildingHeights.filter((h) => Number.isFinite(h) && h > 0).sort((a, b) => a - b);
  if (heights.length === 0) return STREAM_MIN_PLANE_M;
  const roof = heights[Math.min(heights.length - 1, Math.floor(heights.length * STREAM_ROOF_PERCENTILE))]!;
  return Math.max(STREAM_MIN_PLANE_M, roof + STREAM_ROOF_CLEARANCE_M);
}

export function streamSite(model: CityModel): StreamSite {
  return { halfWidthM: (model.widthM ?? model.sideM) / 2, halfHeightM: (model.heightM ?? model.sideM) / 2 };
}

export function streamPlaneY(model: CityModel): number {
  const base = model.terrain ? (model.terrain.min + model.terrain.max) / 2 : 0;
  return base + streamPlaneHeightM(model.buildings.map((building) => building.height));
}

export function streamTravelProgress(clockSeconds: number, periodS: number, phase: number): number {
  const turns = clockSeconds / periodS + phase;
  return turns - Math.floor(turns);
}

export function streamTravelFade(progress: number): number {
  const fadeIn = smooth(Math.max(0, Math.min(1, progress / STREAM_FADE_IN)));
  const fadeOut = smooth(Math.max(0, Math.min(1, (1 - progress) / STREAM_FADE_OUT)));
  return fadeIn * fadeOut;
}

export type StreamTravelPose = { tailM: number; tipM: number; alpha: number };

export function streamTravelPose(arrow: Pick<StreamArrow, "track" | "lengthM">, progress: number): StreamTravelPose {
  const { fromM, toM } = arrow.track;
  const entryTipM = Math.min(fromM + arrow.lengthM * ENTRY_LENGTH_SHARE, toM);
  const tipM = entryTipM + (toM - entryTipM) * progress;
  return { tailM: Math.max(fromM, tipM - arrow.lengthM), tipM, alpha: streamTravelFade(progress) };
}

export function streamPoseSeconds(clockSeconds: number): number | null {
  return clockSeconds > 0 ? clockSeconds : null;
}

function tailFade(along: number): number {
  return TAIL_FADE_FLOOR + (1 - TAIL_FADE_FLOOR) * smooth(Math.min(1, along / TAIL_FADE_SPAN));
}

export type StreamFanMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> & {
  userData: { fan: StreamFan; colours: Float32Array; poseSeconds: number | null };
};

const poseOutline = new Float32Array(STREAM_VERTS_PER_ARROW * 2);
const poseAlong = new Float32Array(STREAM_VERTS_PER_ARROW);

export function writeStreamFanPose(mesh: StreamFanMesh, poseSeconds: number | null): void {
  const { fan, colours } = mesh.userData;
  const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const positions = position.array as Float32Array;
  let v = 0;
  for (const arrow of fan.arrows) {
    let outline = arrow.positions;
    let along = arrow.along;
    let alpha = 1;
    if (poseSeconds !== null) {
      const pose = streamTravelPose(arrow, streamTravelProgress(poseSeconds, fan.periodS, arrow.phase));
      writeStreamArrowOutline(arrow.track, pose.tailM, pose.tipM, arrow.shape, poseOutline, poseAlong);
      outline = poseOutline;
      along = poseAlong;
      alpha = pose.alpha;
    }
    for (let i = 0; i < STREAM_VERTS_PER_ARROW; i++) {
      positions[v * 3] = outline[i * 2]!;
      positions[v * 3 + 2] = -outline[i * 2 + 1]!;
      colours[v * 4 + 3] = tailFade(along[i]!) * alpha;
      v += 1;
    }
  }
  position.needsUpdate = true;
  mesh.geometry.getAttribute("color").needsUpdate = true;
  mesh.userData.poseSeconds = poseSeconds;
}

export function withStreamStillFrame<T>(root: THREE.Object3D, render: () => T): T {
  const meshes: StreamFanMesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && object.name.startsWith(STREAM_MESH_NAME)) meshes.push(object as StreamFanMesh);
  });
  const travelling = meshes.map((mesh) => mesh.userData.poseSeconds);
  for (const mesh of meshes) writeStreamFanPose(mesh, null);
  try {
    return render();
  } finally {
    meshes.forEach((mesh, i) => writeStreamFanPose(mesh, travelling[i]!));
  }
}

export function createStreamFanMesh(fan: StreamFan, planeY: number): StreamFanMesh {
  const vertexCount = fan.arrows.length * STREAM_VERTS_PER_ARROW;
  const positions = new Float32Array(vertexCount * 3);
  const colours = new Float32Array(vertexCount * 4).fill(1);
  const indices = new Uint16Array(fan.arrows.length * STREAM_INDICES_PER_ARROW);
  fan.arrows.forEach((arrow, k) => {
    for (let i = 0; i < STREAM_VERTS_PER_ARROW; i++) positions[(k * STREAM_VERTS_PER_ARROW + i) * 3 + 1] = planeY;
    for (let i = 0; i < STREAM_INDICES_PER_ARROW; i++) {
      indices[k * STREAM_INDICES_PER_ARROW + i] = arrow.indices[i]! + k * STREAM_VERTS_PER_ARROW;
    }
  });
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  const colourAttribute = new THREE.BufferAttribute(colours, 4);
  colourAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("color", colourAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material) as StreamFanMesh;
  mesh.name = `${STREAM_MESH_NAME}${fan.rank + 1}`;
  mesh.renderOrder = STREAM_RENDER_ORDER + fan.rank;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData = { fan, colours, poseSeconds: null };
  writeStreamFanPose(mesh, null);
  return mesh;
}

export function tintStreamFanMesh(mesh: StreamFanMesh, colourOf: (token: PrevailingStreamToken) => string): void {
  mesh.material.color.set(colourOf(mesh.userData.fan.token));
}
