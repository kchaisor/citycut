import {
  CONTOUR_COLOR,
  CONTOUR_DASH_MM,
  CONTOUR_GAP_MM,
  LINE_MM,
  PATH_FILL,
  PATH_WIDTH_M,
  screenDashPx,
  screenPx,
} from "./lineweights";

/**
 * Site-plan pens. The values in src/drawing-style.css are the ones Kelvin edits.
 * These defaults are only used when a variable is missing. In the browser,
 * `readDrawingStyle` calls `getComputedStyle` on `:root`, so the stylesheet
 * wins over this file and an inline override from the Line styles editor wins
 * over the stylesheet. The Illustrator export calls the same function at
 * export time, which is how a download picks up a live edit.
 */

export type StrokeKey =
  | "building"
  | "kerb"
  | "path"
  | "rail"
  | "green"
  | "water"
  | "contour"
  | "frame"
  | "annotation"
  | "tree";

export type StrokeStyle = {
  /** Printed millimetres. */
  mm: number;
  /** #RRGGBB */
  color: string;
  /** `none`, or two millimetre lengths "on off". `0 0.6` is a dotted line. */
  dash: string;
};

export type LineStyles = {
  building: StrokeStyle;
  kerb: StrokeStyle;
  path: StrokeStyle;
  rail: StrokeStyle;
  green: StrokeStyle;
  water: StrokeStyle;
  contour: StrokeStyle;
  frame: StrokeStyle;
  annotation: StrokeStyle;
  tree: StrokeStyle;
  roadFill: string;
  /** Drawn on the boundary of the unioned carriageway. */
  kerbOn: boolean;
  /** Full footpath width in metres on the ground. Half lies each side of the centreline. */
  pathWidthM: number;
  pathFill: string;
  /** Stroke on the unioned footpath outline only. */
  pathEdgeOn: boolean;
  /** Printed millimetres for every Nth contour. Same colour and dash as `contour`. */
  contourIndexMm: number;
  /** Index every Nth drawn contour. 5 is 5 m on 1 m lines and 25 m once those lines are drawn at 5 m. */
  contourIndexEvery: number;
  /** Metres between metro contours once the plan scale is small enough to thin them. */
  contourCoarseIntervalM: number;
  /** Scale denominator at which that coarser interval starts. 2500 is 1:2500 and smaller. */
  contourCoarseFromScale: number;
};

export const STROKE_KEYS = [
  "building",
  "kerb",
  "path",
  "rail",
  "green",
  "water",
  "contour",
  "frame",
  "annotation",
  "tree",
] as const satisfies readonly StrokeKey[];

export const STROKE_LABELS: Record<StrokeKey, string> = {
  building: "Building outlines",
  kerb: "Road kerb",
  path: "Footpath edge",
  rail: "Rail",
  green: "Green edges",
  water: "Water edges",
  contour: "Contours",
  frame: "Frame",
  annotation: "Annotation",
  tree: "Tree crowns",
};

type VarNames = { mm: string; color: string; dash: string };

export const STROKE_VARS: Record<StrokeKey, VarNames> = {
  building: { mm: "--building-stroke-mm", color: "--building-stroke", dash: "--building-dash" },
  kerb: { mm: "--road-kerb-mm", color: "--road-kerb-stroke", dash: "--road-kerb-dash" },
  path: { mm: "--path-edge-mm", color: "--path-edge-stroke", dash: "--path-edge-dash" },
  rail: { mm: "--rail-stroke-mm", color: "--rail-stroke", dash: "--rail-dash" },
  green: { mm: "--green-stroke-mm", color: "--green-stroke", dash: "--green-dash" },
  water: { mm: "--water-stroke-mm", color: "--water-stroke", dash: "--water-dash" },
  contour: { mm: "--contour-stroke-mm", color: "--contour-stroke", dash: "--contour-dash" },
  frame: { mm: "--frame-stroke-mm", color: "--frame-stroke", dash: "--frame-dash" },
  annotation: { mm: "--annotation-stroke-mm", color: "--annotation-stroke", dash: "--annotation-dash" },
  tree: { mm: "--tree-stroke-mm", color: "--tree-stroke", dash: "--tree-dash" },
};

export const ROAD_FILL_VAR = "--road-fill";
export const ROAD_KERB_VAR = "--road-kerb";
export const PATH_WIDTH_VAR = "--path-width-m";
export const PATH_FILL_VAR = "--path-fill";
export const PATH_EDGE_VAR = "--path-edge";
export const CONTOUR_INDEX_MM_VAR = "--contour-index-mm";
export const CONTOUR_INDEX_EVERY_VAR = "--contour-index-every";
export const CONTOUR_COARSE_INTERVAL_VAR = "--contour-coarse-interval-m";
export const CONTOUR_COARSE_FROM_SCALE_VAR = "--contour-coarse-from-scale";
export const LINE_STYLES_KEY = "citycut.lineStyles";

/** Previous centreline names. Read as the footpath edge when the new names are absent. */
const LEGACY_PATH_VARS: Record<string, string> = {
  "--path-stroke-mm": "--path-edge-mm",
  "--path-stroke": "--path-edge-stroke",
  "--path-dash": "--path-edge-dash",
};

export const DASH_PRESETS = [
  { id: "solid", label: "Solid", value: "none" },
  { id: "dashed", label: "Dashed 1.5 0.75", value: "1.5 0.75" },
  { id: "fine", label: "Fine dash 0.75 0.4", value: "0.75 0.4" },
  { id: "dotted", label: "Dotted", value: "0 0.6" },
] as const;

export type DashPresetId = (typeof DASH_PRESETS)[number]["id"] | "custom";

const INK = "#1C1B17";

export const DEFAULT_LINE_STYLES: LineStyles = {
  building: { mm: LINE_MM.buildingCut, color: INK, dash: "none" },
  kerb: { mm: LINE_MM.propertyRoad, color: "#8D8983", dash: "none" },
  path: { mm: LINE_MM.secondary, color: "#5C5C5C", dash: "none" },
  rail: { mm: LINE_MM.secondary, color: "#8D6244", dash: "none" },
  green: { mm: 0, color: "#5E8A45", dash: "none" },
  water: { mm: 0, color: "#3E7C86", dash: "none" },
  contour: { mm: LINE_MM.contour, color: CONTOUR_COLOR.toUpperCase(), dash: `${CONTOUR_DASH_MM} ${CONTOUR_GAP_MM}` },
  frame: { mm: LINE_MM.frame, color: INK, dash: "none" },
  annotation: { mm: LINE_MM.annotation, color: INK, dash: "none" },
  tree: { mm: LINE_MM.secondary, color: "#245232", dash: "none" },
  roadFill: "#4A4A4A",
  kerbOn: true,
  pathWidthM: PATH_WIDTH_M,
  pathFill: PATH_FILL,
  pathEdgeOn: false,
  contourIndexMm: 0.18,
  contourIndexEvery: 5,
  contourCoarseIntervalM: 5,
  contourCoarseFromScale: 2500,
};

export function allStyleVariables(): string[] {
  const names: string[] = [];
  for (const key of STROKE_KEYS) {
    const vars = STROKE_VARS[key];
    names.push(vars.mm, vars.color, vars.dash);
  }
  names.push(
    ROAD_FILL_VAR,
    ROAD_KERB_VAR,
    PATH_WIDTH_VAR,
    PATH_FILL_VAR,
    PATH_EDGE_VAR,
    CONTOUR_INDEX_MM_VAR,
    CONTOUR_INDEX_EVERY_VAR,
    CONTOUR_COARSE_INTERVAL_VAR,
    CONTOUR_COARSE_FROM_SCALE_VAR,
  );
  return names;
}

const KNOWN = new Set(allStyleVariables());

export function cloneLineStyles(style: LineStyles = DEFAULT_LINE_STYLES): LineStyles {
  return {
    building: { ...style.building },
    kerb: { ...style.kerb },
    path: { ...style.path },
    rail: { ...style.rail },
    green: { ...style.green },
    water: { ...style.water },
    contour: { ...style.contour },
    frame: { ...style.frame },
    annotation: { ...style.annotation },
    tree: { ...style.tree },
    roadFill: style.roadFill,
    kerbOn: style.kerbOn,
    pathWidthM: style.pathWidthM,
    pathFill: style.pathFill,
    pathEdgeOn: style.pathEdgeOn,
    contourIndexMm: style.contourIndexMm,
    contourIndexEvery: style.contourIndexEvery,
    contourCoarseIntervalM: style.contourCoarseIntervalM,
    contourCoarseFromScale: style.contourCoarseFromScale,
  };
}

export function parseColor(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const text = raw.trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const body = hex[1];
    const full = body.length === 3 ? body.split("").map((char) => char + char).join("") : body;
    return `#${full.toUpperCase()}`;
  }
  const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!rgb) return null;
  const channel = (value: string) =>
    Math.max(0, Math.min(255, Math.round(Number(value))))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
}

/** Ground metres. Rounded to 0.1 m, the editor step. */
export function parseMetres(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const text = raw.trim().toLowerCase().replace(/m$/, "").trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.min(30, Math.max(0, Math.round(value * 10) / 10));
}

export function formatMetres(metres: number): string {
  return String(Math.round(metres * 10) / 10);
}

export function parseMm(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase().replace(/mm$/, "").trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.min(5, Math.max(0, Math.round(value * 100) / 100));
}

export function formatMm(mm: number): string {
  return String(Math.round(mm * 100) / 100);
}

/** Ground metres between thinned contours. 0 leaves the native interval. */
export function parseCoarseInterval(raw: string | undefined | null): number | null {
  return parseMetres(raw);
}

/** Plan-scale denominator, such as 2500 for 1:2500. */
export function parseScaleDenominator(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const text = raw.trim().toLowerCase().replace(/^1\s*:\s*/, "");
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.min(100000, Math.max(1, Math.round(value)));
}

/** Whole intervals, from 1 to 20. 1 draws every contour as an index line. */
export function parseIndexEvery(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.min(20, Math.max(1, Math.round(value)));
}

/** `none` is solid. Anything else is "on off" in millimetres. */
export function normalizeDash(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const text = raw.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!text) return null;
  if (text === "none" || text === "solid") return "none";
  const parts = text.split(" ").map(Number);
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  const pair = parts.length === 1 ? [parts[0], parts[0]] : [parts[0], parts[1]];
  return `${formatMm(pair[0])} ${formatMm(pair[1])}`;
}

export function dashPresetId(dash: string): DashPresetId {
  const norm = normalizeDash(dash) ?? "none";
  const found = DASH_PRESETS.find((preset) => preset.value === norm);
  return found ? found.id : "custom";
}

export function dashIsDotted(dash: string): boolean {
  const norm = normalizeDash(dash);
  if (!norm || norm === "none") return false;
  return Number(norm.split(" ")[0]) === 0;
}

export function dashPair(dash: string): readonly [number, number] | null {
  const norm = normalizeDash(dash);
  if (!norm || norm === "none") return null;
  const [on, off] = norm.split(" ").map(Number);
  if (!Number.isFinite(on) || !Number.isFinite(off)) return null;
  return [on, off];
}

/**
 * SVG stroke for a pen. A weight of 0 is `stroke="none"` and does not set a
 * width, so the 0.6 px screen floor never turns a hidden edge into a line.
 */
export function screenPenAttrs(stroke: StrokeStyle, join: "miter" | "round" = "round") {
  if (!(stroke.mm > 0)) return { stroke: "none" as const };
  const dash = dashScreen(stroke.dash);
  return {
    stroke: stroke.color,
    strokeWidth: screenPx(stroke.mm),
    strokeDasharray: dash.array,
    strokeLinecap: dash.cap as "round" | "butt",
    strokeLinejoin: join,
    vectorEffect: "non-scaling-stroke" as const,
  };
}

/** On-screen dash array. Dots use round caps so a zero-length dash is a dot. */
export function dashScreen(dash: string): { array?: string; cap: "round" | "butt" } {
  const pair = dashPair(dash);
  if (!pair) return { cap: "butt" };
  return {
    array: `${screenDashPx(pair[0])} ${screenDashPx(pair[1])}`,
    cap: dashIsDotted(dash) ? "round" : "butt",
  };
}

/** Paper-coloured casing so a thin line still reads on the dark carriageway. */
export function haloMm(mm: number): number {
  if (!(mm > 0)) return 0;
  return Math.round(Math.max(mm * 2.4, mm + 0.18) * 100) / 100;
}

function parseKerb(raw: string | undefined | null): boolean | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  if (text === "on" || text === "true" || text === "yes" || text === "1") return true;
  if (text === "off" || text === "false" || text === "no" || text === "0") return false;
  return null;
}

/**
 * Build a style from custom-property values. An empty or invalid value keeps
 * the TypeScript default. A present value wins, which is how the CSS file
 * overrides `lineweights.ts`.
 */
export function styleFromProperties(
  read: (name: string) => string | undefined | null,
  base: LineStyles = DEFAULT_LINE_STYLES,
): LineStyles {
  const next = cloneLineStyles(base);
  for (const key of STROKE_KEYS) {
    const vars = STROKE_VARS[key];
    const mm = parseMm(read(vars.mm));
    const color = parseColor(read(vars.color));
    const dash = normalizeDash(read(vars.dash));
    if (mm != null) next[key].mm = mm;
    if (color) next[key].color = color;
    if (dash) next[key].dash = dash;
  }
  const fill = parseColor(read(ROAD_FILL_VAR));
  if (fill) next.roadFill = fill;
  const kerb = parseKerb(read(ROAD_KERB_VAR));
  if (kerb != null) next.kerbOn = kerb;
  const width = parseMetres(read(PATH_WIDTH_VAR));
  if (width != null) next.pathWidthM = width;
  const pathFill = parseColor(read(PATH_FILL_VAR));
  if (pathFill) next.pathFill = pathFill;
  const edge = parseKerb(read(PATH_EDGE_VAR));
  if (edge != null) next.pathEdgeOn = edge;
  const indexMm = parseMm(read(CONTOUR_INDEX_MM_VAR));
  if (indexMm != null) next.contourIndexMm = indexMm;
  const indexEvery = parseIndexEvery(read(CONTOUR_INDEX_EVERY_VAR));
  if (indexEvery != null) next.contourIndexEvery = indexEvery;
  const coarseInterval = parseCoarseInterval(read(CONTOUR_COARSE_INTERVAL_VAR));
  if (coarseInterval != null) next.contourCoarseIntervalM = coarseInterval;
  const coarseFrom = parseScaleDenominator(read(CONTOUR_COARSE_FROM_SCALE_VAR));
  if (coarseFrom != null) next.contourCoarseFromScale = coarseFrom;
  const pathVars = STROKE_VARS.path;
  if (parseMm(read(pathVars.mm)) == null) {
    const legacyMm = parseMm(read("--path-stroke-mm"));
    if (legacyMm != null) next.path.mm = legacyMm;
  }
  if (!parseColor(read(pathVars.color))) {
    const legacyColor = parseColor(read("--path-stroke"));
    if (legacyColor) next.path.color = legacyColor;
  }
  if (!normalizeDash(read(pathVars.dash))) {
    const legacyDash = normalizeDash(read("--path-dash"));
    if (legacyDash) next.path.dash = legacyDash;
  }
  return next;
}

/**
 * Resolved site-plan style. In the browser this is `getComputedStyle` on
 * `document.documentElement` (`:root`), so the cascade is the source of truth
 * at the moment of the call — including Line styles edits applied as inline
 * custom properties. Without a document, the TypeScript defaults are used.
 */
export function readDrawingStyle(read?: (name: string) => string): LineStyles {
  if (read) return styleFromProperties(read);
  if (typeof document === "undefined") return cloneLineStyles();
  const computed = getComputedStyle(document.documentElement);
  return styleFromProperties((name) => computed.getPropertyValue(name));
}

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function readStoredOverrides(storage: StorageLike): Record<string, string> {
  try {
    const raw = storage.getItem(LINE_STYLES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const name = LEGACY_PATH_VARS[key] ?? key;
      if (!KNOWN.has(name) || typeof value !== "string" || !value.trim()) continue;
      if (out[name] && LEGACY_PATH_VARS[key]) continue;
      out[name] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function writeStoredOverrides(storage: StorageLike, overrides: Record<string, string>): void {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!KNOWN.has(key) || typeof value !== "string" || !value.trim()) continue;
    clean[key] = value.trim();
  }
  if (Object.keys(clean).length === 0) storage.removeItem(LINE_STYLES_KEY);
  else storage.setItem(LINE_STYLES_KEY, JSON.stringify(clean));
}

/** Variables whose resolved value differs from the stylesheet baseline. */
export function changedVariables(current: LineStyles, baseline: LineStyles): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of STROKE_KEYS) {
    const vars = STROKE_VARS[key];
    if (formatMm(current[key].mm) !== formatMm(baseline[key].mm)) out[vars.mm] = formatMm(current[key].mm);
    if (current[key].color.toUpperCase() !== baseline[key].color.toUpperCase()) out[vars.color] = current[key].color.toUpperCase();
    const dash = normalizeDash(current[key].dash);
    const baseDash = normalizeDash(baseline[key].dash);
    if (dash && baseDash && dash !== baseDash) out[vars.dash] = dash;
  }
  if (current.roadFill.toUpperCase() !== baseline.roadFill.toUpperCase()) out[ROAD_FILL_VAR] = current.roadFill.toUpperCase();
  if (current.kerbOn !== baseline.kerbOn) out[ROAD_KERB_VAR] = current.kerbOn ? "on" : "off";
  if (formatMetres(current.pathWidthM) !== formatMetres(baseline.pathWidthM)) out[PATH_WIDTH_VAR] = formatMetres(current.pathWidthM);
  if (current.pathFill.toUpperCase() !== baseline.pathFill.toUpperCase()) out[PATH_FILL_VAR] = current.pathFill.toUpperCase();
  if (current.pathEdgeOn !== baseline.pathEdgeOn) out[PATH_EDGE_VAR] = current.pathEdgeOn ? "on" : "off";
  if (formatMm(current.contourIndexMm) !== formatMm(baseline.contourIndexMm)) {
    out[CONTOUR_INDEX_MM_VAR] = formatMm(current.contourIndexMm);
  }
  if (current.contourIndexEvery !== baseline.contourIndexEvery) {
    out[CONTOUR_INDEX_EVERY_VAR] = String(current.contourIndexEvery);
  }
  if (formatMetres(current.contourCoarseIntervalM) !== formatMetres(baseline.contourCoarseIntervalM)) {
    out[CONTOUR_COARSE_INTERVAL_VAR] = formatMetres(current.contourCoarseIntervalM);
  }
  if (current.contourCoarseFromScale !== baseline.contourCoarseFromScale) {
    out[CONTOUR_COARSE_FROM_SCALE_VAR] = String(current.contourCoarseFromScale);
  }
  return out;
}

/** A block Kelvin can paste into src/drawing-style.css. Only changed variables. */
export function copyCssText(current: LineStyles, baseline: LineStyles): string {
  const changed = changedVariables(current, baseline);
  const names = Object.keys(changed);
  if (names.length === 0) return "/* No line-style changes to paste. */\n";
  const body = names.map((name) => `${name}: ${changed[name]};`).join("\n");
  return `/* Paste into src/drawing-style.css */\n${body}\n`;
}

let fileBaseline: LineStyles | null = null;

export function lineStyleBaseline(): LineStyles {
  return cloneLineStyles(fileBaseline ?? DEFAULT_LINE_STYLES);
}

export function applyOverrides(overrides: Record<string, string>, root?: HTMLElement): void {
  const element = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!element) return;
  for (const name of KNOWN) {
    const value = overrides[name];
    if (value) element.style.setProperty(name, value);
    else element.style.removeProperty(name);
  }
}

/**
 * Read the stylesheet first (that baseline is what Reset and Copy CSS compare
 * against), then apply anything saved under `citycut.lineStyles`.
 */
export function hydrateStoredLineStyles(storage?: StorageLike): LineStyles {
  if (typeof document === "undefined") {
    fileBaseline = cloneLineStyles();
    return cloneLineStyles();
  }
  applyOverrides({}, document.documentElement);
  fileBaseline = readDrawingStyle();
  let stored: Record<string, string> = {};
  try {
    stored = readStoredOverrides(storage ?? window.localStorage);
  } catch {
    stored = {};
  }
  applyOverrides(stored);
  return readDrawingStyle();
}

export function commitLineStyles(next: LineStyles, baseline: LineStyles = lineStyleBaseline()): LineStyles {
  const overrides = changedVariables(next, baseline);
  try {
    if (typeof window !== "undefined") writeStoredOverrides(window.localStorage, overrides);
  } catch {
    // Private mode can reject localStorage. The on-screen style still updates.
  }
  applyOverrides(overrides);
  return cloneLineStyles(next);
}

export function resetStoredLineStyles(): LineStyles {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(LINE_STYLES_KEY);
  } catch {
    // Ignore a locked storage area. Clearing the inline properties is enough.
  }
  applyOverrides({});
  if (typeof document === "undefined") return cloneLineStyles(fileBaseline ?? DEFAULT_LINE_STYLES);
  return readDrawingStyle();
}

export function patchStroke(style: LineStyles, key: StrokeKey, patch: Partial<StrokeStyle>): LineStyles {
  const next = cloneLineStyles(style);
  next[key] = { ...next[key], ...patch };
  return next;
}
