import type { Pt } from "../types";
import type { ArrowStyle } from "./diagramArrows";
import {
  PATH_EPS,
  arrowHead,
  pathLength,
  pointAtDistance,
  resamplePath,
  ribbonAlong,
  ribbonFromProfile,
  ribbonPolygon,
  smoothArrowPath,
  subPath,
  subdividePath,
  type ArrowHead,
  type ArrowRibbon,
} from "./diagramArrowsPath";

type ArrowKind = "ribbon" | "comets" | "dots" | "chevrons";

type StylePreset = {
  kind: ArrowKind;
  halfWidthFrac: number;
  sweep: boolean;
  head: { lengthFrac: number; halfWidthFrac: number } | null;
  tailHead: boolean;
  dash: { onFrac: number; offFrac: number } | null;
};

export const ARROW_PRESETS: Record<ArrowStyle, StylePreset> = {
  streak: { kind: "comets", halfWidthFrac: 0.7, sweep: false, head: null, tailHead: false, dash: null },
  tapered: { kind: "ribbon", halfWidthFrac: 0.6, sweep: true, head: { lengthFrac: 2.8, halfWidthFrac: 1.4 }, tailHead: false, dash: null },
  bold: { kind: "ribbon", halfWidthFrac: 0.5, sweep: false, head: { lengthFrac: 3, halfWidthFrac: 1.6 }, tailHead: false, dash: null },
  line: { kind: "ribbon", halfWidthFrac: 0.12, sweep: false, head: { lengthFrac: 2.4, halfWidthFrac: 0.9 }, tailHead: false, dash: null },
  dashed: { kind: "ribbon", halfWidthFrac: 0.3, sweep: false, head: { lengthFrac: 2.4, halfWidthFrac: 0.9 }, tailHead: false, dash: { onFrac: 2.8, offFrac: 1.2 } },
  dotted: { kind: "dots", halfWidthFrac: 0.45, sweep: false, head: { lengthFrac: 2.6, halfWidthFrac: 1.1 }, tailHead: false, dash: null },
  chevron: { kind: "chevrons", halfWidthFrac: 1.1, sweep: false, head: null, tailHead: false, dash: null },
  double: { kind: "ribbon", halfWidthFrac: 0.2, sweep: false, head: { lengthFrac: 2.4, halfWidthFrac: 1 }, tailHead: true, dash: null },
};

const WIDTH_SIDE_FRAC = 0.011;
const MIN_UNIT_PX = 7;
const MIN_HALF_WIDTH_PX = 1.25;
const SAMPLE_STEP_UNITS = 0.35;
const TAIL_POINT_UNITS = 2.4;
const MARCH_DASH = { onFrac: 2.8, offFrac: 1.2 };
const DOT_SIDES = 14;
const DOT_SPACING_UNITS = 1.9;
const CHEVRON_DEPTH_UNITS = 1.7;
const CHEVRON_NOTCH_FRAC = 0.5;
const CHEVRON_SPACING_UNITS = 2.8;
const CHEVRON_LEAD_SCALE = 1.5;
const COMET_MIN_HALF_UNITS = 0.5;
const COMET_HEAD_HALF_FRAC = 1.7;
const COMET_HEAD_LENGTH_FRAC = 3.4;
const COMET_TAIL_SAMPLES = 14;
const COMET_HEAD_SAMPLES = 3;
const COMET_FADE_FRAC = 0.08;
const COMET_FADE_POWER = 1.4;
const COMET_FEED_UNITS_PER_S = 9;
const COMET_LONG_BODY_UNITS = 70;
const DASH_SPINDLE_SEGMENTS = 8;

export const RIBBON_BANDS = 12;

export function arrowUnitM(width: number, sideM: number): number {
  return Math.max(0.5, sideM * WIDTH_SIDE_FRAC * width);
}

export type ArrowShape = { ribbons: ArrowRibbon[]; heads: ArrowHead[]; polygons: Pt[][] };

export type ArrowMotion = { kind: "draw-on"; progress: number } | { kind: "dashes"; phase: number };

export type ShapeFill = { polygon: Pt[]; alpha: number };

export function emptyArrowShape(): ArrowShape {
  return { ribbons: [], heads: [], polygons: [] };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

type ArrowMetrics = {
  smooth: Pt[];
  preset: StylePreset;
  unit: number;
  half: number;
  total: number;
  headLen: number;
  headHalf: number;
  tailLen: number;
  body: Pt[];
  bodyLen: number;
};

function arrowMetrics(points: readonly Pt[], style: ArrowStyle, width: number, sideM: number, floorMPerPx: number): ArrowMetrics | null {
  const smooth = smoothArrowPath(points);
  if (smooth.length < 2) return null;
  const preset = ARROW_PRESETS[style];
  const unit = Math.max(arrowUnitM(width, sideM), floorMPerPx * MIN_UNIT_PX);
  const half = Math.max(unit * preset.halfWidthFrac, floorMPerPx * MIN_HALF_WIDTH_PX);
  const total = pathLength(smooth);
  const headLen = preset.head ? Math.min(unit * preset.head.lengthFrac, total * 0.45) : 0;
  const headHalf = preset.head ? unit * preset.head.halfWidthFrac : 0;
  const tailLen = preset.tailHead ? headLen : 0;
  const body = subPath(smooth, tailLen, total - headLen);
  return { smooth, preset, unit, half, total, headLen, headHalf, tailLen, body, bodyLen: pathLength(body) };
}

function addHeads(shape: ArrowShape, m: ArrowMetrics, progress: number): void {
  if (!m.preset.head) return;
  if (progress >= 1 - PATH_EPS) {
    const end = pointAtDistance(m.smooth, m.total);
    shape.heads.push(arrowHead(end.point, end.dir, m.headLen, m.headHalf));
  }
  if (m.preset.tailHead) {
    const start = pointAtDistance(m.smooth, 0);
    shape.heads.push(arrowHead(start.point, [-start.dir[0], -start.dir[1]], m.headLen, m.headHalf));
  }
}

function sine(fraction: number): number {
  return Math.sin(clamp01(fraction) * (Math.PI / 2));
}

function addContinuousBody(shape: ArrowShape, m: ArrowMetrics, progress: number): void {
  const limit = m.bodyLen * progress;
  const run = subdividePath(subPath(m.body, 0, limit), m.unit * SAMPLE_STEP_UNITS);
  const tailTaper = Math.min(m.unit * TAIL_POINT_UNITS, m.bodyLen * 0.5);
  const frontTaper = progress >= 1 - PATH_EPS ? 0 : tailTaper * clamp01((1 - progress) / 0.1);
  const pointedTail = !m.preset.tailHead;
  const ribbon = ribbonAlong(run, (f) => {
    const s = f * limit;
    let half = m.half;
    if (m.preset.sweep) half *= sine(s / m.bodyLen);
    else if (pointedTail && tailTaper > PATH_EPS) half *= sine(s / tailTaper);
    if (frontTaper > PATH_EPS) half *= sine((limit - s) / frontTaper);
    return half;
  });
  if (ribbon) shape.ribbons.push(ribbon);
}

function addDashes(shape: ArrowShape, m: ArrowMetrics, progress: number, motion: ArrowMotion | null): void {
  const dash = m.preset.dash ?? MARCH_DASH;
  const limit = m.bodyLen * progress;
  const on = m.unit * dash.onFrac;
  const period = on + m.unit * dash.offFrac;
  const shift = motion?.kind === "dashes" ? (((motion.phase % 1) + 1) % 1) * period : 0;
  for (let at = shift - period; at < limit - PATH_EPS; at += period) {
    const from = Math.max(0, at);
    const to = Math.min(at + on, limit);
    if (to - from < PATH_EPS) continue;
    const run = resamplePath(subPath(m.body, from, to), DASH_SPINDLE_SEGMENTS);
    const ribbon = ribbonAlong(run, (f) => m.half * Math.sin(f * Math.PI));
    if (ribbon) shape.ribbons.push(ribbon);
  }
}

function dotPolygon(centre: Pt, radius: number): Pt[] {
  return Array.from({ length: DOT_SIDES }, (_, i) => {
    const angle = (i / DOT_SIDES) * Math.PI * 2;
    return [centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius] as Pt;
  });
}

function edgeScale(at: number, length: number, reach: number): number {
  return clamp01(Math.min(at, length - at) / reach);
}

function addDots(shape: ArrowShape, m: ArrowMetrics, progress: number, motion: ArrowMotion | null): void {
  const marching = motion?.kind === "dashes";
  const phase = marching ? (((motion.phase % 1) + 1) % 1) : 0;
  const spacing = m.unit * DOT_SPACING_UNITS;
  const limit = m.bodyLen * progress;
  for (let k = 0; ; k += 1) {
    const at = m.half + (k + phase) * spacing;
    if (at > limit - m.half * (marching ? 0 : 1)) break;
    const scale = marching ? edgeScale(at, m.bodyLen, m.half * 1.5) : 1;
    if (scale <= PATH_EPS) continue;
    shape.polygons.push(dotPolygon(pointAtDistance(m.body, at).point, m.half * scale));
  }
}

function chevronPolygon(tip: Pt, dir: Pt, depth: number, wing: number): Pt[] {
  const nx = -dir[1];
  const ny = dir[0];
  const back: Pt = [tip[0] - dir[0] * depth, tip[1] - dir[1] * depth];
  const notch: Pt = [tip[0] - dir[0] * depth * CHEVRON_NOTCH_FRAC, tip[1] - dir[1] * depth * CHEVRON_NOTCH_FRAC];
  return [tip, [back[0] + nx * wing, back[1] + ny * wing], notch, [back[0] - nx * wing, back[1] - ny * wing]];
}

function addChevrons(shape: ArrowShape, m: ArrowMetrics, progress: number, motion: ArrowMotion | null): void {
  const marching = motion?.kind === "dashes";
  const phase = marching ? (((motion.phase % 1) + 1) % 1) : 0;
  const depth = m.unit * CHEVRON_DEPTH_UNITS;
  const wing = m.half;
  const spacing = m.unit * CHEVRON_SPACING_UNITS;
  const limit = m.total * progress;
  for (let j = 1; ; j += 1) {
    const at = m.total - j * spacing + phase * spacing;
    if (at < depth * (marching ? 0 : 1)) break;
    if (at > limit) continue;
    const scale = marching ? edgeScale(at, m.total, depth) : 1;
    if (scale <= PATH_EPS) continue;
    const { point, dir } = pointAtDistance(m.smooth, at);
    shape.polygons.push(chevronPolygon(point, dir, depth * scale, wing * scale));
  }
  if (progress >= 1 - PATH_EPS) {
    const end = pointAtDistance(m.smooth, m.total);
    shape.polygons.push(chevronPolygon(end.point, end.dir, depth * CHEVRON_LEAD_SCALE, wing * CHEVRON_LEAD_SCALE));
  }
}

type CometLayout = { count: number; spacing: number; length: number };

function cometLayout(m: ArrowMetrics): CometLayout {
  const count = m.bodyLen >= m.unit * COMET_LONG_BODY_UNITS ? 4 : 3;
  const spacing = m.bodyLen / count;
  return { count, spacing, length: Math.min(m.unit * 14, Math.max(m.unit * 3, spacing * 0.62)) };
}

function cometRibbon(m: ArrowMetrics, layout: CometLayout, headAt: number): ArrowRibbon | null {
  const half = Math.max(m.half, m.unit * COMET_MIN_HALF_UNITS);
  const headHalf = half * COMET_HEAD_HALF_FRAC;
  const headLen = Math.min(half * COMET_HEAD_LENGTH_FRAC, layout.length * 0.4);
  const bodyLen = layout.length - headLen;
  const fade = m.bodyLen * COMET_FADE_FRAC;
  const samples: { s: number; half: number }[] = [];
  for (let j = 0; j <= COMET_TAIL_SAMPLES; j += 1) {
    const s = (bodyLen * j) / COMET_TAIL_SAMPLES;
    samples.push({ s, half: half * sine(s / bodyLen) });
  }
  samples.push({ s: bodyLen, half: headHalf });
  for (let j = 1; j <= COMET_HEAD_SAMPLES; j += 1) {
    samples.push({ s: bodyLen + (headLen * j) / COMET_HEAD_SAMPLES, half: headHalf * (1 - j / COMET_HEAD_SAMPLES) });
  }
  const path: Pt[] = [];
  const halves: number[] = [];
  const alpha: number[] = [];
  for (const sample of samples) {
    const d = headAt - layout.length + sample.s;
    if (d < 0 || d > m.bodyLen) continue;
    path.push(pointAtDistance(m.body, d).point);
    halves.push(sample.half);
    const envelope = fade > PATH_EPS ? smooth01(d / fade) * smooth01((m.bodyLen - d) / fade) : 1;
    alpha.push(Math.pow(sample.s / layout.length, COMET_FADE_POWER) * envelope);
  }
  return ribbonFromProfile(path, halves, alpha);
}

function cometRibbons(m: ArrowMetrics, seconds: number | null): ArrowRibbon[] {
  if (m.bodyLen < PATH_EPS) return [];
  const layout = cometLayout(m);
  const heads: number[] = [];
  if (seconds === null) {
    for (let i = 0; i < layout.count; i += 1) heads.push(layout.spacing * (i + 0.8));
  } else {
    const lead = (((seconds * m.unit * COMET_FEED_UNITS_PER_S) % layout.spacing) + layout.spacing) % layout.spacing;
    for (let head = lead; head - layout.length < m.bodyLen; head += layout.spacing) heads.push(head);
  }
  const ribbons: ArrowRibbon[] = [];
  for (const head of heads) {
    const ribbon = cometRibbon(m, layout, head);
    if (ribbon) ribbons.push(ribbon);
  }
  return ribbons;
}

export function buildArrowShape(
  points: readonly Pt[],
  style: ArrowStyle,
  width: number,
  sideM: number,
  floorMPerPx = 0,
  motion: ArrowMotion | null = null,
): ArrowShape {
  const shape = emptyArrowShape();
  const m = arrowMetrics(points, style, width, sideM, floorMPerPx);
  if (!m) return shape;
  if (m.preset.kind === "comets") {
    shape.ribbons.push(...cometRibbons(m, null));
    return shape;
  }
  const progress = motion?.kind === "draw-on" ? clamp01(motion.progress) : 1;
  addHeads(shape, m, progress);
  if (m.preset.kind === "chevrons") {
    addChevrons(shape, m, progress, motion);
    return shape;
  }
  if (m.body.length < 2) return shape;
  if (m.preset.kind === "dots") addDots(shape, m, progress, motion);
  else if (m.preset.dash || motion?.kind === "dashes") addDashes(shape, m, progress, motion);
  else addContinuousBody(shape, m, progress);
  return shape;
}

export function buildCometRibbons(
  points: readonly Pt[],
  style: ArrowStyle,
  width: number,
  sideM: number,
  floorMPerPx: number,
  seconds: number | null,
): ArrowRibbon[] {
  const m = arrowMetrics(points, style, width, sideM, floorMPerPx);
  return m ? cometRibbons(m, seconds) : [];
}

export function ribbonBands(ribbon: ArrowRibbon, bands = RIBBON_BANDS): ShapeFill[] {
  const alpha = ribbon.alpha;
  if (!alpha) return [{ polygon: ribbonPolygon(ribbon), alpha: 1 }];
  const segments = ribbon.left.length - 1;
  const parts = Math.max(1, Math.min(bands, segments));
  const fills: ShapeFill[] = [];
  for (let k = 0; k < parts; k += 1) {
    const from = Math.round((k * segments) / parts);
    const to = Math.round(((k + 1) * segments) / parts);
    if (to <= from) continue;
    const slice = { left: ribbon.left.slice(from, to + 1), right: ribbon.right.slice(from, to + 1) };
    const mean = alpha.slice(from, to + 1).reduce((sum, value) => sum + value, 0) / (to - from + 1);
    fills.push({ polygon: ribbonPolygon(slice), alpha: mean });
  }
  return fills;
}

export function shapeFills(shape: ArrowShape, bands = RIBBON_BANDS): ShapeFill[] {
  return [
    ...shape.ribbons.flatMap((ribbon) => ribbonBands(ribbon, bands)),
    ...shape.heads.map((polygon) => ({ polygon, alpha: 1 })),
    ...shape.polygons.map((polygon) => ({ polygon, alpha: 1 })),
  ];
}
