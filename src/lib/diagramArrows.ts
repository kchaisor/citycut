import type { ColourKey } from "./colours";
import type { Pt } from "../types";

export const DIAGRAM_ARROWS_STORAGE_KEY = "citycut.diagramArrows.v1";
export const DIAGRAM_ARROWS_VERSION = 1;
export const MIN_ARROW_POINTS = 2;
export const DEFAULT_ARROW_HEIGHT_M = 20;
export const MAX_ARROW_HEIGHT_M = 500;
export const MAX_ARROW_LABEL_LENGTH = 60;

export const ARROW_STYLES = ["streak", "bold", "line", "dashed", "double"] as const;
export type ArrowStyle = (typeof ARROW_STYLES)[number];

export const ARROW_COLOURS = ["ink", "red", "blue", "green", "amber"] as const;
export type ArrowColour = (typeof ARROW_COLOURS)[number];

export const ARROW_WIDTHS = ["s", "m", "l"] as const;
export type ArrowWidth = (typeof ARROW_WIDTHS)[number];

export const ARROW_ANIMATIONS = ["none", "streaks", "draw-on", "dashes"] as const;
export type ArrowAnimation = (typeof ARROW_ANIMATIONS)[number];

export type DiagramArrow = {
  id: string;
  points: Pt[];
  style: ArrowStyle;
  colour: ArrowColour;
  width: ArrowWidth;
  heightM: number;
  label: string;
  animation: ArrowAnimation;
  showIn3d: boolean;
  showInDrawing: boolean;
};

export type ArrowDefaults = Omit<DiagramArrow, "id" | "points">;

export const ARROW_STYLE_LABELS: Record<ArrowStyle, string> = {
  streak: "Streak",
  bold: "Bold",
  line: "Line",
  dashed: "Dashed",
  double: "Double",
};

export const ARROW_COLOUR_LABELS: Record<ArrowColour, string> = {
  ink: "Ink",
  red: "Red",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
};

export const ARROW_WIDTH_LABELS: Record<ArrowWidth, string> = { s: "S", m: "M", l: "L" };

export const ARROW_ANIMATION_LABELS: Record<ArrowAnimation, string> = {
  none: "None",
  streaks: "Streaks",
  "draw-on": "Draw on",
  dashes: "Dashes",
};

export const ARROW_COLOUR_TOKENS: Record<ArrowColour, ColourKey> = {
  ink: "--arrow-ink",
  red: "--arrow-red",
  blue: "--arrow-blue",
  green: "--arrow-green",
  amber: "--arrow-amber",
};

export const DEFAULT_ARROW: ArrowDefaults = {
  style: "bold",
  colour: "ink",
  width: "m",
  heightM: DEFAULT_ARROW_HEIGHT_M,
  label: "",
  animation: "none",
  showIn3d: true,
  showInDrawing: true,
};

type StylePreset = {
  halfWidthFrac: number;
  taper: boolean;
  head: { lengthFrac: number; halfWidthFrac: number } | null;
  tailHead: boolean;
  dash: { onFrac: number; offFrac: number } | null;
};

export const ARROW_PRESETS: Record<ArrowStyle, StylePreset> = {
  streak: { halfWidthFrac: 0.7, taper: true, head: { lengthFrac: 2.2, halfWidthFrac: 1.1 }, tailHead: false, dash: null },
  bold: { halfWidthFrac: 0.5, taper: false, head: { lengthFrac: 3, halfWidthFrac: 1.6 }, tailHead: false, dash: null },
  line: { halfWidthFrac: 0.12, taper: false, head: { lengthFrac: 2.4, halfWidthFrac: 0.9 }, tailHead: false, dash: null },
  dashed: { halfWidthFrac: 0.14, taper: false, head: { lengthFrac: 2.4, halfWidthFrac: 0.9 }, tailHead: false, dash: { onFrac: 2.4, offFrac: 1.6 } },
  double: { halfWidthFrac: 0.2, taper: false, head: { lengthFrac: 2.4, halfWidthFrac: 1 }, tailHead: true, dash: null },
};

const WIDTH_SIDE_FRAC: Record<ArrowWidth, number> = { s: 0.006, m: 0.011, l: 0.018 };

export function arrowUnitM(width: ArrowWidth, sideM: number): number {
  return Math.max(0.5, sideM * WIDTH_SIDE_FRAC[width]);
}

const EPS = 1e-6;
const MIN_UNIT_PX = 7;
const MIN_HALF_WIDTH_PX = 1.25;
const STREAK_TAIL_FRAC = 0.3;

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function dedupePoints(points: readonly Pt[], minGapM = EPS): Pt[] {
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
  const t1 = t0 + Math.max(d1, EPS);
  const t2 = t1 + Math.max(d2, EPS);
  const t3 = t2 + Math.max(d3, EPS);
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
      const u = len > EPS ? Math.min(1, remaining / len) : 0;
      const dir: Pt = len > EPS ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
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
  if (end - start < EPS) return [];
  const out: Pt[] = [pointAtDistance(path, start).point];
  let walked = 0;
  for (let i = 1; i < path.length; i += 1) {
    walked += dist(path[i - 1]!, path[i]!);
    if (walked > start + EPS && walked < end - EPS) out.push(path[i]!);
  }
  out.push(pointAtDistance(path, end).point);
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

export type ArrowRibbon = { left: Pt[]; right: Pt[] };

function normalAt(path: readonly Pt[], i: number): Pt {
  const a = path[Math.max(0, i - 1)]!;
  const b = path[Math.min(path.length - 1, i + 1)]!;
  const len = dist(a, b);
  return len > EPS ? [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] : [0, 1];
}

export function ribbonAlong(path: readonly Pt[], halfWidthAt: (fraction: number) => number): ArrowRibbon | null {
  if (path.length < 2) return null;
  const total = pathLength(path);
  const left: Pt[] = [];
  const right: Pt[] = [];
  let walked = 0;
  for (let i = 0; i < path.length; i += 1) {
    if (i > 0) walked += dist(path[i - 1]!, path[i]!);
    const half = halfWidthAt(total > EPS ? walked / total : 0);
    const n = normalAt(path, i);
    const p = path[i]!;
    left.push([p[0] + n[0] * half, p[1] + n[1] * half]);
    right.push([p[0] - n[0] * half, p[1] - n[1] * half]);
  }
  return { left, right };
}

export type ArrowShape = { ribbons: ArrowRibbon[]; heads: ArrowHead[] };

export type ArrowMotion = { kind: "draw-on"; progress: number } | { kind: "dashes"; phase: number };

const MARCH_DASH = { onFrac: 2.4, offFrac: 1.6 };
const STREAK_LENGTH_UNITS = 7;
const STREAK_MIN_HALF_UNITS = 0.4;
const STREAK_TAIL_WIDTH_FRAC = 0.15;

type ArrowMetrics = {
  smooth: Pt[];
  preset: StylePreset;
  unit: number;
  half: number;
  total: number;
  headLen: number;
  headHalf: number;
  tailLen: number;
};

function arrowMetrics(points: readonly Pt[], style: ArrowStyle, width: ArrowWidth, sideM: number, floorMPerPx: number): ArrowMetrics | null {
  const smooth = smoothArrowPath(points);
  if (smooth.length < 2) return null;
  const preset = ARROW_PRESETS[style];
  const unit = Math.max(arrowUnitM(width, sideM), floorMPerPx * MIN_UNIT_PX);
  const half = Math.max(unit * preset.halfWidthFrac, floorMPerPx * MIN_HALF_WIDTH_PX);
  const total = pathLength(smooth);
  const headLen = preset.head ? Math.min(unit * preset.head.lengthFrac, total * 0.45) : 0;
  const headHalf = preset.head ? unit * preset.head.halfWidthFrac : 0;
  return { smooth, preset, unit, half, total, headLen, headHalf, tailLen: preset.tailHead ? headLen : 0 };
}

function arrowBody(m: ArrowMetrics): Pt[] {
  return subPath(m.smooth, m.tailLen, m.total - m.headLen);
}

export function buildArrowShape(
  points: readonly Pt[],
  style: ArrowStyle,
  width: ArrowWidth,
  sideM: number,
  floorMPerPx = 0,
  motion: ArrowMotion | null = null,
): ArrowShape {
  const shape: ArrowShape = { ribbons: [], heads: [] };
  const m = arrowMetrics(points, style, width, sideM, floorMPerPx);
  if (!m) return shape;
  const { smooth, preset, unit, half, total, headLen, headHalf } = m;
  const progress = motion?.kind === "draw-on" ? Math.max(0, Math.min(1, motion.progress)) : 1;
  if (preset.head) {
    if (progress >= 1 - EPS) {
      const end = pointAtDistance(smooth, total);
      shape.heads.push(arrowHead(end.point, end.dir, headLen, headHalf));
    }
    if (preset.tailHead) {
      const start = pointAtDistance(smooth, 0);
      shape.heads.push(arrowHead(start.point, [-start.dir[0], -start.dir[1]], headLen, headHalf));
    }
  }
  const body = arrowBody(m);
  if (body.length < 2) return shape;
  const bodyLen = pathLength(body);
  const limit = bodyLen * progress;
  const bodyHalf = preset.taper ? (f: number) => half * (STREAK_TAIL_FRAC + (1 - STREAK_TAIL_FRAC) * f) : () => half;
  const dash = preset.dash ?? (motion?.kind === "dashes" ? MARCH_DASH : null);
  if (dash) {
    const on = unit * dash.onFrac;
    const period = on + unit * dash.offFrac;
    const shift = motion?.kind === "dashes" ? (((motion.phase % 1) + 1) % 1) * period : 0;
    for (let at = shift - period; at < limit - EPS; at += period) {
      const from = Math.max(0, at);
      const to = Math.min(at + on, limit);
      if (to - from < EPS) continue;
      const ribbon = ribbonAlong(subPath(body, from, to), (f) => bodyHalf((from + f * (to - from)) / bodyLen));
      if (ribbon) shape.ribbons.push(ribbon);
    }
    return shape;
  }
  const ribbon = ribbonAlong(subPath(body, 0, limit), (f) => bodyHalf((f * limit) / bodyLen));
  if (ribbon) shape.ribbons.push(ribbon);
  return shape;
}

export type StreakSpan = { from: number; to: number; startM: number };

export function streakSpans(seconds: number, bodyLen: number, unit: number): StreakSpan[] {
  if (bodyLen < EPS || unit <= 0) return [];
  const length = unit * STREAK_LENGTH_UNITS;
  const spacing = unit * 22;
  const lead = (((seconds * unit * 9) % spacing) + spacing) % spacing;
  const spans: StreakSpan[] = [];
  for (let head = lead; head - length < bodyLen; head += spacing) {
    const from = Math.max(0, head - length);
    const to = Math.min(head, bodyLen);
    if (to - from > EPS) spans.push({ from, to, startM: head - length });
  }
  return spans;
}

export function buildStreakRibbons(
  points: readonly Pt[],
  style: ArrowStyle,
  width: ArrowWidth,
  sideM: number,
  floorMPerPx: number,
  seconds: number,
): ArrowRibbon[] {
  const m = arrowMetrics(points, style, width, sideM, floorMPerPx);
  if (!m) return [];
  const body = arrowBody(m);
  if (body.length < 2) return [];
  const length = m.unit * STREAK_LENGTH_UNITS;
  const half = Math.max(m.half, m.unit * STREAK_MIN_HALF_UNITS);
  const ribbons: ArrowRibbon[] = [];
  for (const span of streakSpans(seconds, pathLength(body), m.unit)) {
    const ribbon = ribbonAlong(subPath(body, span.from, span.to), (f) => {
      const along = (span.from + f * (span.to - span.from) - span.startM) / length;
      return half * (STREAK_TAIL_WIDTH_FRAC + (1 - STREAK_TAIL_WIDTH_FRAC) * along);
    });
    if (ribbon) ribbons.push(ribbon);
  }
  return ribbons;
}

export function ribbonPolygon(ribbon: ArrowRibbon): Pt[] {
  return [...ribbon.left, ...[...ribbon.right].reverse()];
}

export function arrowLabelAnchor(points: readonly Pt[]): Pt {
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
    const u = len2 > EPS ? Math.min(1, Math.max(0, ((at[0] - a[0]) * abx + (at[1] - a[1]) * aby) / len2)) : 0;
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

export function hitArrow(arrows: readonly DiagramArrow[], at: Pt, toleranceM: number): string | null {
  let best: string | null = null;
  let bestDist = toleranceM;
  for (const arrow of arrows) {
    const d = distanceToPath(smoothArrowPath(arrow.points), at);
    if (d <= bestDist) {
      bestDist = d;
      best = arrow.id;
    }
  }
  return best;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.find((item) => item === value) ?? fallback;
}

function parsePoints(value: unknown): Pt[] | null {
  if (!Array.isArray(value)) return null;
  const points: Pt[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [x, y] = item as unknown[];
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push([x, y]);
  }
  return points;
}

export function clampArrowHeight(value: number): number {
  return Math.min(MAX_ARROW_HEIGHT_M, Math.max(0, value));
}

export function parseDiagramArrow(value: unknown): DiagramArrow | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null;
  const points = parsePoints(value.points);
  if (!points || dedupePoints(points).length < MIN_ARROW_POINTS) return null;
  const height = typeof value.heightM === "number" && Number.isFinite(value.heightM) ? clampArrowHeight(value.heightM) : DEFAULT_ARROW_HEIGHT_M;
  return {
    id: value.id,
    points,
    style: oneOf(ARROW_STYLES, value.style, DEFAULT_ARROW.style),
    colour: oneOf(ARROW_COLOURS, value.colour, DEFAULT_ARROW.colour),
    width: oneOf(ARROW_WIDTHS, value.width, DEFAULT_ARROW.width),
    heightM: height,
    label: typeof value.label === "string" ? value.label.slice(0, MAX_ARROW_LABEL_LENGTH) : "",
    animation: oneOf(ARROW_ANIMATIONS, value.animation, DEFAULT_ARROW.animation),
    showIn3d: value.showIn3d !== false,
    showInDrawing: value.showInDrawing !== false,
  };
}

export function parseDiagramArrows(value: unknown): DiagramArrow[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: DiagramArrow[] = [];
  for (const item of value) {
    const arrow = parseDiagramArrow(item);
    if (!arrow || seen.has(arrow.id)) continue;
    seen.add(arrow.id);
    out.push(arrow);
  }
  return out;
}

export type DiagramArrowsStore = { version: typeof DIAGRAM_ARROWS_VERSION; byCut: Record<string, DiagramArrow[]> };

export type DiagramArrowsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function emptyDiagramArrowsStore(): DiagramArrowsStore {
  return { version: DIAGRAM_ARROWS_VERSION, byCut: {} };
}

export function parseDiagramArrowsStore(raw: string | null): DiagramArrowsStore {
  if (!raw) return emptyDiagramArrowsStore();
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== DIAGRAM_ARROWS_VERSION || !isRecord(data.byCut)) return emptyDiagramArrowsStore();
    const byCut: Record<string, DiagramArrow[]> = {};
    for (const [cutId, list] of Object.entries(data.byCut)) {
      const arrows = parseDiagramArrows(list);
      if (arrows.length) byCut[cutId] = arrows;
    }
    return { version: DIAGRAM_ARROWS_VERSION, byCut };
  } catch {
    return emptyDiagramArrowsStore();
  }
}

export function readDiagramArrowsStore(storage: DiagramArrowsStorage): DiagramArrowsStore {
  try {
    return parseDiagramArrowsStore(storage.getItem(DIAGRAM_ARROWS_STORAGE_KEY));
  } catch {
    return emptyDiagramArrowsStore();
  }
}

export function writeDiagramArrowsStore(storage: DiagramArrowsStorage, store: DiagramArrowsStore): boolean {
  try {
    storage.setItem(DIAGRAM_ARROWS_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function arrowsForCut(store: DiagramArrowsStore, cutId: string): DiagramArrow[] {
  return store.byCut[cutId] ?? [];
}

export function withCutArrows(store: DiagramArrowsStore, cutId: string, arrows: readonly DiagramArrow[]): DiagramArrowsStore {
  const byCut = { ...store.byCut };
  if (arrows.length) byCut[cutId] = [...arrows];
  else delete byCut[cutId];
  return { version: DIAGRAM_ARROWS_VERSION, byCut };
}

let arrowSerial = 0;

export function newArrowId(): string {
  arrowSerial += 1;
  return `arrow-${Date.now().toString(36)}-${arrowSerial.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function visibleIn3d(arrows: readonly DiagramArrow[]): DiagramArrow[] {
  return arrows.filter((arrow) => arrow.showIn3d);
}

export function visibleInDrawing(arrows: readonly DiagramArrow[]): DiagramArrow[] {
  return arrows.filter((arrow) => arrow.showInDrawing);
}
