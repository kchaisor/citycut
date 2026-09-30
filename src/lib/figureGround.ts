import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";

type ClipFns = {
  union: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
  intersection: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

// The published ESM bundle default-exports the API; the CJS build and the typings use named exports.
function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.union === "function") return loaded;
  if (loaded.default && typeof loaded.default.union === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { union, intersection } = clippingFns();
import { signedArea } from "./geo";
import type { BuildingFeat, CityModel, Pt } from "../types";

/** Finest scale first. 1:5000 is what lets a 1 km frame sit on A3. */
export const FIGURE_SCALES = [500, 1000, 2500, 5000] as const;

export type FigureScale = (typeof FIGURE_SCALES)[number];

/** ISO 216 A3, millimetres. */
export const A3_SHORT_MM = 297;
export const A3_LONG_MM = 420;

/** Outer margin, and the bottom band that holds the scale bar, north arrow, and notes. */
export const SHEET_EDGE_MM = 10;
export const SHEET_BAND_MM = 18;

const MIN_FOOTPRINT_M2 = 0.25;
const MIN_HOLE_M2 = 0.05;
const SNAP_M = 0.001;
/** Buildings whose boxes fall inside this gap are unioned together. */
const TOUCH_M = 0.02;

export type FigureGround = {
  /** Unioned footprints in local east/north metres. Rings are closed; holes follow the outer ring. */
  polygons: MultiPolygon;
  /** Building polygons on the model, before union. */
  before: number;
  /** Outer rings after clipping to the frame and union. */
  after: number;
};

export type SheetOrientation = "landscape" | "portrait";

export type SheetLayout = {
  scale: number;
  sideM: number;
  frameMm: number;
  fitsOnA3: boolean;
  orientation: SheetOrientation;
  pageWidthMm: number;
  pageHeightMm: number;
  frameX: number;
  frameY: number;
  edgeMm: number;
  bandMm: number;
  barMetres: number;
  barMm: number;
  barX: number;
  barY: number;
  barHeightMm: number;
  northX: number;
  northTipY: number;
  northBaseY: number;
  titleY: number;
  creditY: number;
  note: string | null;
};

const roundMm = (value: number) => Math.round(value * 1000) / 1000;
const roundM = (value: number) => Math.round(value * 100) / 100;

function num(value: number): string {
  return String(roundMm(value));
}

/** Paper millimetres for a ground length at 1:scale. 1 m at 1:1000 is 1 mm. */
export function paperMillimetres(groundMetres: number, scale: number): number {
  return (groundMetres * 1000) / scale;
}

function pageSize(orientation: SheetOrientation): { width: number; height: number } {
  return orientation === "landscape"
    ? { width: A3_LONG_MM, height: A3_SHORT_MM }
    : { width: A3_SHORT_MM, height: A3_LONG_MM };
}

/** Largest square frame that still leaves the edge margin and the bottom band. */
export function maxFrameMm(orientation: SheetOrientation): number {
  const page = pageSize(orientation);
  const width = page.width - SHEET_EDGE_MM * 2;
  const height = page.height - SHEET_EDGE_MM - SHEET_BAND_MM;
  return Math.min(width, height);
}

const BAR_STEPS_M = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** A round ground length. Without a scale, about a fifth of the frame (the on-screen bar). */
export function scaleBarMetres(groundSpanM: number, scale?: number): number {
  if (scale == null) {
    const target = groundSpanM * 0.2;
    let best = BAR_STEPS_M[0];
    for (const step of BAR_STEPS_M) if (step <= target) best = step;
    return best;
  }
  const limitMm = Math.min(60, paperMillimetres(groundSpanM, scale) * 0.4);
  let best = BAR_STEPS_M[0];
  for (const step of BAR_STEPS_M) {
    if (paperMillimetres(step, scale) <= limitMm + 1e-6) best = step;
  }
  return best;
}

export function sheetFitNote(layout: Pick<SheetLayout, "fitsOnA3" | "scale" | "frameMm">): string | null {
  if (layout.fitsOnA3) return null;
  return `Does not fit on A3 at 1:${layout.scale} (${num(layout.frameMm)} mm square; A3 is 297 × 420 mm).`;
}

/** Sentence for the export card. Null when the frame fits. */
export function sheetFitMessage(sideM: number, scale: number): string | null {
  const layout = layoutSheet(sideM, scale);
  if (layout.fitsOnA3) return null;
  return `This ${Math.round(sideM)} m frame is ${num(layout.frameMm)} mm square at 1:${scale} and does not fit on A3 (297 × 420 mm). The download stays at true scale, on a ${num(layout.pageWidthMm)} × ${num(layout.pageHeightMm)} mm sheet.`;
}

/** Finest listed scale that places the frame on A3, or 1:5000 when none do. */
export function preferredFigureScale(sideM: number): FigureScale {
  for (const scale of FIGURE_SCALES) {
    if (layoutSheet(sideM, scale).fitsOnA3) return scale;
  }
  return FIGURE_SCALES[FIGURE_SCALES.length - 1];
}

export function layoutSheet(sideM: number, scale: number): SheetLayout {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Figure-ground scale must be a positive number.");
  if (!Number.isFinite(sideM) || sideM <= 0) throw new Error("Figure-ground needs a frame side in metres.");
  const frameMm = paperMillimetres(sideM, scale);
  const fitsLandscape = frameMm <= maxFrameMm("landscape") + 1e-6;
  const fitsPortrait = frameMm <= maxFrameMm("portrait") + 1e-6;
  let orientation: SheetOrientation;
  let pageWidthMm: number;
  let pageHeightMm: number;
  let fitsOnA3: boolean;
  if (fitsLandscape || fitsPortrait) {
    fitsOnA3 = true;
    // A square uses the short side. Landscape still wins when it fits: the long side
    // carries the margin note. Portrait is the one that fits a slightly larger square,
    // because the band sits on the long edge and the short edge only loses two margins.
    orientation = fitsLandscape ? "landscape" : "portrait";
    const page = pageSize(orientation);
    pageWidthMm = page.width;
    pageHeightMm = page.height;
  } else {
    fitsOnA3 = false;
    pageWidthMm = frameMm + SHEET_EDGE_MM * 2;
    pageHeightMm = frameMm + SHEET_EDGE_MM + SHEET_BAND_MM;
    orientation = pageWidthMm >= pageHeightMm ? "landscape" : "portrait";
  }
  const availW = pageWidthMm - SHEET_EDGE_MM * 2;
  const availH = pageHeightMm - SHEET_EDGE_MM - SHEET_BAND_MM;
  const frameX = SHEET_EDGE_MM + (availW - frameMm) / 2;
  const frameY = SHEET_EDGE_MM + (availH - frameMm) / 2;
  const barMetres = scaleBarMetres(sideM, scale);
  const barMm = paperMillimetres(barMetres, scale);
  const barHeightMm = 2.2;
  const barX = SHEET_EDGE_MM;
  const barY = pageHeightMm - 15.2;
  const northX = barX + barMm + 16;
  const layout: SheetLayout = {
    scale,
    sideM,
    frameMm,
    fitsOnA3,
    orientation,
    pageWidthMm,
    pageHeightMm,
    frameX,
    frameY,
    edgeMm: SHEET_EDGE_MM,
    bandMm: SHEET_BAND_MM,
    barMetres,
    barMm,
    barX,
    barY,
    barHeightMm,
    northX,
    northTipY: pageHeightMm - 15.8,
    northBaseY: pageHeightMm - 11.2,
    titleY: pageHeightMm - 7.6,
    creditY: pageHeightMm - 3.5,
    note: null,
  };
  layout.note = sheetFitNote(layout);
  return layout;
}

function snapPoint(point: Pt): Pair {
  return [Math.round(point[0] / SNAP_M) * SNAP_M, Math.round(point[1] / SNAP_M) * SNAP_M];
}

function cleanOpen(points: Pt[]): Pair[] | null {
  const snapped: Pair[] = [];
  for (const point of points) {
    const next = snapPoint(point);
    const last = snapped[snapped.length - 1];
    if (last && last[0] === next[0] && last[1] === next[1]) continue;
    snapped.push(next);
  }
  if (snapped.length >= 2) {
    const first = snapped[0];
    const last = snapped[snapped.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) snapped.pop();
  }
  if (snapped.length < 3) return null;
  const simplified: Pair[] = [];
  const count = snapped.length;
  for (let i = 0; i < count; i++) {
    const prev = snapped[(i + count - 1) % count];
    const current = snapped[i];
    const next = snapped[(i + 1) % count];
    const cross =
      (current[0] - prev[0]) * (next[1] - current[1]) - (current[1] - prev[1]) * (next[0] - current[0]);
    if (Math.abs(cross) > 1e-8) simplified.push(current);
  }
  if (simplified.length < 3) return null;
  return simplified;
}

function closeRing(open: Pair[]): Ring {
  return [...open, open[0]];
}

function orient(open: Pair[], ccw: boolean): Ring {
  const positive = signedArea(open) > 0;
  const ring = positive === ccw ? open : open.slice().reverse();
  return closeRing(ring);
}

function buildingPolygon(building: BuildingFeat): Polygon | null {
  const outer = cleanOpen(building.ring);
  if (!outer || Math.abs(signedArea(outer)) < MIN_FOOTPRINT_M2) return null;
  const holes: Ring[] = [];
  for (const hole of building.holes) {
    const open = cleanOpen(hole);
    if (!open || Math.abs(signedArea(open)) < MIN_HOLE_M2) continue;
    holes.push(orient(open, false));
  }
  return [orient(outer, true), ...holes];
}

function framePolygon(sideM: number): Polygon {
  const half = sideM / 2;
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

function clipPolygonToFrame(polygon: Polygon, frame: Polygon): Polygon[] {
  try {
    return intersection(polygon, frame);
  } catch {
    try {
      return intersection([polygon[0]], frame);
    } catch {
      return [];
    }
  }
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function boxOf(polygon: Polygon): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon[0]) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return { minX, minY, maxX, maxY };
}

function boxesTouch(a: Box, b: Box): boolean {
  return a.minX <= b.maxX + TOUCH_M && b.minX <= a.maxX + TOUCH_M && a.minY <= b.maxY + TOUCH_M && b.minY <= a.maxY + TOUCH_M;
}

function unionCluster(polygons: Polygon[]): MultiPolygon {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return [polygons[0]];
  let batch: MultiPolygon[] = polygons.map((polygon) => [polygon]);
  while (batch.length > 1) {
    const next: MultiPolygon[] = [];
    for (let i = 0; i < batch.length; i += 2) {
      if (i + 1 >= batch.length) {
        next.push(batch[i]);
        continue;
      }
      try {
        next.push(union(batch[i], batch[i + 1]));
      } catch {
        next.push(batch[i], batch[i + 1]);
      }
    }
    if (next.length >= batch.length) break;
    batch = next;
  }
  return batch.flat();
}

/** Union only clusters whose boxes overlap or touch, so a detached house is left as-is. */
function unionTouching(polygons: Polygon[]): MultiPolygon {
  const count = polygons.length;
  if (count === 0) return [];
  const parent = Array.from({ length: count }, (_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const unite = (a: number, b: number) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent[left] = right;
  };
  const boxes = polygons.map(boxOf);
  const cell = 32;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const box = boxes[i];
    const x0 = Math.floor((box.minX - TOUCH_M) / cell);
    const x1 = Math.floor((box.maxX + TOUCH_M) / cell);
    const y0 = Math.floor((box.minY - TOUCH_M) / cell);
    const y1 = Math.floor((box.maxY + TOUCH_M) / cell);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = `${x}:${y}`;
        const bucket = grid.get(id);
        if (bucket) {
          for (const other of bucket) {
            if (boxesTouch(boxes[other], box)) unite(i, other);
          }
          bucket.push(i);
        } else grid.set(id, [i]);
      }
    }
  }
  const groups = new Map<number, Polygon[]>();
  for (let i = 0; i < count; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(polygons[i]);
    else groups.set(root, [polygons[i]]);
  }
  const merged: Polygon[] = [];
  for (const group of groups.values()) merged.push(...unionCluster(group));
  return merged;
}

function clipUnion(polygons: MultiPolygon, frame: Polygon): MultiPolygon {
  if (polygons.length === 0) return [];
  try {
    return intersection(polygons, frame);
  } catch {
    const kept: Polygon[] = [];
    for (const polygon of polygons) {
      try {
        kept.push(...intersection(polygon, frame));
      } catch {
        kept.push(polygon);
      }
    }
    return kept;
  }
}

function tidy(polygons: MultiPolygon): MultiPolygon {
  const kept: MultiPolygon = [];
  for (const polygon of polygons) {
    if (polygon.length === 0) continue;
    const outerArea = Math.abs(signedArea(polygon[0]));
    if (outerArea < MIN_FOOTPRINT_M2) continue;
    const holes = polygon.slice(1).filter((hole) => Math.abs(signedArea(hole)) >= MIN_HOLE_M2);
    const holeArea = holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0);
    if (outerArea - holeArea < MIN_FOOTPRINT_M2) continue;
    kept.push([polygon[0], ...holes]);
  }
  return kept;
}

/**
 * Building footprints from the model, clipped to the cut square, then unioned
 * where they overlap or touch. Courtyard holes stay holes.
 */
export function figureGround(buildings: BuildingFeat[], sideM: number): FigureGround {
  const before = buildings.length;
  if (before === 0 || !(sideM > 0)) return { polygons: [], before, after: 0 };
  const frame = framePolygon(sideM);
  const clipped: Polygon[] = [];
  for (const building of buildings) {
    const polygon = buildingPolygon(building);
    if (!polygon) continue;
    clipped.push(...clipPolygonToFrame(polygon, frame));
  }
  const polygons = tidy(clipUnion(unionTouching(clipped), frame));
  return { polygons, before, after: polygons.length };
}

/** Flat ground is z = 0. With terrain, the curves sit on the lowest sample, the cut's ground datum. */
export function figureGroundDatum(model: CityModel): number {
  return model.terrain ? model.terrain.min : 0;
}

function openRing(ring: Ring): Pair[] {
  if (
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  ) {
    return ring.slice(0, -1);
  }
  return ring;
}

function modelPath(polygon: Polygon): string {
  const parts: string[] = [];
  for (const ring of polygon) {
    const open = openRing(ring);
    if (open.length < 3) continue;
    const body = open
      .map((point, index) => `${index === 0 ? "M" : "L"}${roundM(point[0])} ${roundM(-point[1])}`)
      .join(" ");
    parts.push(`${body} Z`);
  }
  return parts.join(" ");
}

/** Screen-plan paths in local metres, north up (SVG y is minus north). */
export function figureGroundModelPaths(buildings: BuildingFeat[], sideM: number): string[] {
  return figureGround(buildings, sideM)
    .polygons.map(modelPath)
    .filter(Boolean);
}
