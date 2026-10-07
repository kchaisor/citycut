import { figureGround } from "./figureGround";
import { getColour } from "./colours";
import { openRing } from "./geo";
import { clipAreaToSiteFrame, clipPolylineSiteFrame, circleRing, DEFAULT_SITE_FRAME_SHAPE, type SiteFrameShape } from "./siteFrame";
import type { CityModel, Pt } from "../types";

const roundIso = (value: number) => Math.round(value * 100) / 100;

/** Iso screen path (y down). Do not use site-plan svgPolyline — it negates y. */
export function isoSvgPolyline(points: Pt[], close: boolean): string {
  if (points.length < 2) return "";
  const body = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${roundIso(point[0])} ${roundIso(point[1])}`)
    .join(" ");
  return close ? `${body} Z` : body;
}

/** Layer ids, default stack top → bottom. */
export const AXO_LAYER_IDS = ["water", "roads", "green", "buildings", "aerial"] as const;
export type AxoLayerId = (typeof AXO_LAYER_IDS)[number];

export const AXO_LAYER_LABELS: Record<AxoLayerId, string> = {
  water: "FLOODPLAIN",
  roads: "ROADS",
  green: "GREEN SPACES",
  buildings: "BUILDINGS",
  aerial: "SATELLITE",
};

export const DEFAULT_AXO_LAYER_ORDER: AxoLayerId[] = [...AXO_LAYER_IDS];

export type ExplodedAxoSettings = {
  layerOrder: AxoLayerId[];
  layerVisible: Record<AxoLayerId, boolean>;
  /** Vertical separation between layers, in local metres (iso lift). */
  gapM: number;
  showLabels: boolean;
};

/** Vertical span of one frame plate in iso screen metres (same lift). */
export function axoPlateProjectedHeight(sideM: number): number {
  const half = sideM / 2;
  const ys = [
    planPointToIso(half, half, 0)[1],
    planPointToIso(half, -half, 0)[1],
    planPointToIso(-half, half, 0)[1],
    planPointToIso(-half, -half, 0)[1],
  ];
  return Math.max(...ys) - Math.min(...ys);
}

/** Default vertical gap between layers (~40% of one plate height, per reference). */
export function defaultExplodedAxoGapM(sideM: number): number {
  return axoPlateProjectedHeight(sideM) * 0.4;
}

export function defaultExplodedAxoSettings(sideM: number): ExplodedAxoSettings {
  return {
    layerOrder: [...DEFAULT_AXO_LAYER_ORDER],
    layerVisible: {
      water: true,
      roads: true,
      green: true,
      buildings: true,
      aerial: true,
    },
    gapM: defaultExplodedAxoGapM(sideM),
    showLabels: true,
  };
}

const COS30 = Math.sqrt(3) / 2;
const SIN30 = 0.5;
/** Plan east/north metres → isometric screen metres (y grows down). */
export function planPointToIso(east: number, north: number, liftM: number): Pt {
  return [(east - north) * COS30, (east + north) * SIN30 - liftM];
}

export function isoPathFromPlanRing(ring: Pt[], liftM: number, close = true): string {
  const pts = ring.map(([e, n]) => planPointToIso(e, n, liftM));
  return isoSvgPolyline(pts, close);
}

/** SVG transform stacking one layer vertically (base geometry at lift 0). */
export function axoLayerSvgTransform(liftM: number): string {
  return `translate(0 ${roundIso(-liftM)})`;
}

/** Plan → iso at lift 0 (for geometry drawn inside a lifted group). */
export function planToIsoBase(east: number, north: number): Pt {
  return [(east - north) * COS30, (east + north) * SIN30];
}

export function isoPathFromPlanRingBase(ring: Pt[], close = true): string {
  const pts = ring.map(([e, n]) => planToIsoBase(e, n));
  return isoSvgPolyline(pts, close);
}

/** Closed frame boundary in plan east/north (square or circle). */
export function axoFrameBoundaryRing(sideM: number, shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE): Pt[] {
  const half = sideM / 2;
  if (shape === "square") {
    return [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
      [-half, -half],
    ];
  }
  return circleRing(half, 64);
}

/**
 * Four guide anchors in plan metres: square corners, or circle rim at E/W/N/S.
 * Projected to iso these are the left/right/front/back rim of the ellipse.
 */
export function axoGuideAnchorPoints(sideM: number, shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE): Pt[] {
  const half = sideM / 2;
  if (shape === "square") {
    return [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];
  }
  return [
    [half, 0],
    [-half, 0],
    [0, half],
    [0, -half],
  ];
}

export type AxoGuideLine = { x: number; yTop: number; yBottom: number };

/** Screen-vertical guides between the lowest and highest visible layer lifts. */
export function axoGuideLines(
  sideM: number,
  shape: SiteFrameShape,
  lifts: readonly number[],
): AxoGuideLine[] {
  if (lifts.length === 0) return [];
  const minLift = Math.min(...lifts);
  const maxLift = Math.max(...lifts);
  return axoGuideAnchorPoints(sideM, shape).map(([east, north]) => {
    const x = planPointToIso(east, north, 0)[0];
    const yTop = planPointToIso(east, north, maxLift)[1];
    const yBottom = planPointToIso(east, north, minLift)[1];
    return { x, yTop, yBottom };
  });
}

/** Lift in iso metres: aerial = 0 (bottom), water = highest (top of stack). */
export function liftsForLayerOrder(order: AxoLayerId[], gapM: number): Map<AxoLayerId, number> {
  const bottomToTop = [...order].reverse();
  const lifts = new Map<AxoLayerId, number>();
  bottomToTop.forEach((id, index) => lifts.set(id, index * gapM));
  return lifts;
}

/** Painter's order: bottom layer first, top layer last (so water draws on top). */
export function axoLayersForPaint(layers: AxoLayerGeometry[]): AxoLayerGeometry[] {
  return [...layers].sort((a, b) => a.liftM - b.liftM);
}

/** Label beside the plate when geometry lives in a group with `axoLayerSvgTransform`. */
export function axoLayerLabelAnchorBase(sideM: number): { x: number; y: number; rotateDeg: number } {
  return axoLayerLabelAnchor(sideM, 0);
}

export function axoLayerLabelAnchor(
  sideM: number,
  liftM: number,
): { x: number; y: number; rotateDeg: number } {
  const half = sideM / 2;
  const [x0, y0] = planPointToIso(half, -half, liftM);
  const [x1, y1] = planPointToIso(half, half, liftM);
  const rotateDeg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  const along = sideM * 0.05;
  return {
    x: x0 + along * 1.4,
    y: y0 + along * 0.4,
    rotateDeg,
  };
}

export type AxoLayerGeometry = {
  id: AxoLayerId;
  liftM: number;
  /** Filled regions as SVG d strings (evenodd). */
  fills: string[];
  /** Stroked centre lines (roads). */
  strokes: string[];
  /** Frame plate outline at this lift. */
  plateOutlineD: string;
  /** Clip path d (same as plate interior). */
  clipD: string;
};

function dedupe(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of line) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.08) out.push(point);
  }
  return out;
}

function simplifyLine(line: Pt[], maxPoints: number): Pt[] {
  if (line.length <= maxPoints) return line;
  const step = Math.ceil(line.length / maxPoints);
  const out: Pt[] = [];
  for (let i = 0; i < line.length; i += step) out.push(line[i]!);
  const last = line[line.length - 1]!;
  const tail = out[out.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
  return out;
}

function clipRoadLines(model: CityModel): Pt[][] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const lines: Pt[][] = [];
  for (const road of model.roads) {
    if (road.kind === "rail") continue;
    for (const part of clipPolylineSiteFrame(dedupe(road.line), model.sideM, shape)) {
      const simplified = simplifyLine(part, 120);
      if (simplified.length >= 2) lines.push(simplified);
    }
  }
  return lines;
}

function areaRings(model: CityModel, kind: "water" | "green"): Pt[][][] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const out: Pt[][][] = [];
  for (const area of model.areas) {
    if (area.kind !== kind) continue;
    const rings = clipAreaToSiteFrame(area.ring, area.holes, model.sideM, shape);
    if (rings) out.push(rings);
  }
  return out;
}

export function axoPlateOutlineBaseD(sideM: number, shape: SiteFrameShape): string {
  return isoPathFromPlanRingBase(axoFrameBoundaryRing(sideM, shape), true);
}

/** @deprecated use base outline + axoLayerSvgTransform */
export function axoPlateOutlineD(sideM: number, shape: SiteFrameShape, liftM: number): string {
  return isoPathFromPlanRing(axoFrameBoundaryRing(sideM, shape), liftM, true);
}

/** True when the closed iso path is a circle rim (enough segments, not 4 corners). */
export function axoPlateIsCircularRing(_sideM: number, shape: SiteFrameShape): boolean {
  return shape === "circle";
}

export function buildExplodedAxoLayers(
  model: CityModel,
  settings: ExplodedAxoSettings,
): { layers: AxoLayerGeometry[]; guides: AxoGuideLine[] } {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const lifts = liftsForLayerOrder(settings.layerOrder, settings.gapM);
  const visibleLifts = settings.layerOrder
    .filter((id) => settings.layerVisible[id])
    .map((id) => lifts.get(id)!);

  const waterAreas = areaRings(model, "water");
  const greenAreas = areaRings(model, "green");
  const roadLines = clipRoadLines(model);

  const layers: AxoLayerGeometry[] = [];

  for (const id of settings.layerOrder) {
    if (!settings.layerVisible[id]) continue;
    const liftM = lifts.get(id)!;
    const plateOutlineD = axoPlateOutlineBaseD(model.sideM, shape);
    const clipD = plateOutlineD;
    const fills: string[] = [];
    const strokes: string[] = [];

    const areaToPath = (rings: Pt[][]) =>
      rings
        .map((ring) => isoPathFromPlanRingBase(openRing(ring), true))
        .filter(Boolean)
        .join(" ");

    if (id === "water") {
      for (const rings of waterAreas) {
        const d = areaToPath(rings);
        if (d) fills.push(d);
      }
    } else if (id === "green") {
      for (const rings of greenAreas) {
        const d = areaToPath(rings);
        if (d) fills.push(d);
      }
    } else if (id === "buildings") {
      const ground = figureGround(model.buildings, model.sideM, shape);
      for (const polygon of ground.polygons) {
        const parts = polygon
          .map((ring) => isoPathFromPlanRingBase(openRing(ring), true))
          .filter(Boolean);
        if (parts.length) fills.push(parts.join(" "));
      }
    } else if (id === "roads") {
      for (const line of roadLines) {
        const pts = line.map(([e, n]) => planToIsoBase(e, n));
        strokes.push(isoSvgPolyline(pts, false));
      }
    }

    layers.push({ id, liftM, fills, strokes, plateOutlineD, clipD });
  }

  return { layers, guides: axoGuideLines(model.sideM, shape, visibleLifts) };
}

export function axoLayerColours(): Record<AxoLayerId | "guide" | "label", string> {
  return {
    water: getColour("--axo-water"),
    roads: getColour("--axo-road"),
    green: getColour("--axo-green"),
    buildings: getColour("--axo-building"),
    aerial: getColour("--axo-building"),
    guide: getColour("--axo-guide"),
    label: getColour("--axo-label"),
  };
}

/** Iso bounds of the stacked drawing for fitting the viewport. */
/** SVG transform mapping a plan-aligned satellite image onto the iso plate at `liftM`. */
export function isoSatelliteImageTransform(sideM: number, _liftM = 0): string {
  const half = sideM / 2;
  const [x0, y0] = planToIsoBase(-half, -half);
  const [x1, y1] = planToIsoBase(half, -half);
  const [x2, y2] = planToIsoBase(-half, half);
  const ax = (x1 - x0) / sideM;
  const bx = (x2 - x0) / sideM;
  const cx = x0;
  const ay = (y1 - y0) / sideM;
  const by = (y2 - y0) / sideM;
  const cy = y0;
  return `matrix(${ax} ${ay} ${bx} ${by} ${cx} ${cy})`;
}

export function explodedAxoBounds(
  model: CityModel,
  settings: ExplodedAxoSettings,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const { layers, guides } = buildExplodedAxoLayers(model, settings);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const bump = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  const ring = axoFrameBoundaryRing(model.sideM, model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE);
  for (const layer of layers) {
    for (const pt of ring) {
      const [x, y] = planPointToIso(pt[0], pt[1], layer.liftM);
      bump(x, y);
    }
    const label = axoLayerLabelAnchor(model.sideM, layer.liftM);
    bump(label.x, label.y);
    bump(label.x + model.sideM * 0.12, label.y);
  }
  for (const guide of guides) {
    bump(guide.x, guide.yTop);
    bump(guide.x, guide.yBottom);
  }
  const maxLift = layers.reduce((max, layer) => Math.max(max, layer.liftM), 0);
  const pad = Math.max(model.sideM * 0.26, maxLift * 0.15 + model.sideM * 0.04);
  if (!Number.isFinite(minX)) {
    const half = model.sideM / 2;
    return { minX: -half, minY: -half, maxX: half, maxY: half };
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}
