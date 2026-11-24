import type { ColourKey } from "./colours";
import type { Pt } from "../types";
import { dedupePoints, distanceToPath, smoothArrowPath } from "./diagramArrowsPath";

export const DIAGRAM_ARROWS_STORAGE_KEY = "citycut.diagramArrows.v1";
export const DIAGRAM_ARROWS_VERSION = 1;
export const MIN_ARROW_POINTS = 2;
export const DEFAULT_ARROW_HEIGHT_M = 20;
export const MAX_ARROW_HEIGHT_M = 500;

export const MIN_ARROW_WIDTH = 0.4;
export const MAX_ARROW_WIDTH = 2.5;
export const ARROW_WIDTH_STEP = 0.1;
export const DEFAULT_ARROW_WIDTH = 1;

export const MIN_ARROW_SPEED = 0.25;
export const MAX_ARROW_SPEED = 3;
export const ARROW_SPEED_STEP = 0.25;
export const DEFAULT_ARROW_SPEED = 1;

export const ARROW_STYLES = ["streak", "tapered", "bold", "line", "dashed", "dotted", "chevron", "double"] as const;
export type ArrowStyle = (typeof ARROW_STYLES)[number];

export const ARROW_COLOURS = ["ink", "red", "blue", "green", "amber"] as const;
export type ArrowColour = (typeof ARROW_COLOURS)[number];

export const ARROW_ANIMATIONS = ["none", "streaks", "draw-on", "dashes"] as const;
export type ArrowAnimation = (typeof ARROW_ANIMATIONS)[number];

export type DiagramArrow = {
  id: string;
  points: Pt[];
  style: ArrowStyle;
  colour: ArrowColour;
  width: number;
  heightM: number;
  animation: ArrowAnimation;
  speed: number;
  showIn3d: boolean;
  showInDrawing: boolean;
};

export type ArrowDefaults = Omit<DiagramArrow, "id" | "points">;

export const ARROW_STYLE_LABELS: Record<ArrowStyle, string> = {
  streak: "Streak",
  tapered: "Tapered flow",
  bold: "Bold",
  line: "Line",
  dashed: "Dashed",
  dotted: "Dotted",
  chevron: "Chevron run",
  double: "Double",
};

export const ARROW_COLOUR_LABELS: Record<ArrowColour, string> = {
  ink: "Ink",
  red: "Red",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
};

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
  width: DEFAULT_ARROW_WIDTH,
  heightM: DEFAULT_ARROW_HEIGHT_M,
  animation: "none",
  speed: DEFAULT_ARROW_SPEED,
  showIn3d: true,
  showInDrawing: true,
};

const LEGACY_WIDTHS: Record<string, number> = { s: 0.55, m: 1, l: 1.65 };

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

export function clampArrowWidth(value: number): number {
  return Math.min(MAX_ARROW_WIDTH, Math.max(MIN_ARROW_WIDTH, value));
}

export function clampArrowSpeed(value: number): number {
  return Math.min(MAX_ARROW_SPEED, Math.max(MIN_ARROW_SPEED, value));
}

function parseWidth(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return clampArrowWidth(value);
  return typeof value === "string" ? (LEGACY_WIDTHS[value] ?? DEFAULT_ARROW_WIDTH) : DEFAULT_ARROW_WIDTH;
}

function parseSpeed(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clampArrowSpeed(value) : DEFAULT_ARROW_SPEED;
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
    width: parseWidth(value.width),
    heightM: height,
    animation: oneOf(ARROW_ANIMATIONS, value.animation, DEFAULT_ARROW.animation),
    speed: parseSpeed(value.speed),
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
