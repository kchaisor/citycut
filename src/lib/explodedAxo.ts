import { figureGround } from "./figureGround";
import { AXO_CADASTRE_UNAVAILABLE_NOTE, axoCadastreNote, type CadastreOverlay } from "./explodedAxoCadastre";
import {
  AXO_TERRAIN_UNAVAILABLE_NOTE,
  axoTerrainNote,
  buildAxoTerrainMesh,
  DEFAULT_AXO_TERRAIN_EXAGGERATION,
} from "./explodedAxoTerrain";
import { axoCanopyNote, buildAxoCanopyFaces } from "./explodedAxoCanopies";
import { axoMassingHeightNote, buildAxoMassingFaces, type AxoSolidFace } from "./explodedAxoMassing";
import { getColour, type ColourKey } from "./colours";
import { bufferOpenLine } from "./bufferLine";
import { openRing, signedArea } from "./geo";
import { isVehicularRoad } from "./roadFill";
import { sampleTerrain } from "./terrain";
import { demContourLayer } from "./vicmapContours";
import {
  clipAreaToSiteFrame,
  clipPolylineSiteFrame,
  circleRing,
  DEFAULT_SITE_FRAME_SHAPE,
  pointInSiteFrame,
  type SiteFrameShape,
} from "./siteFrame";
import type {
  HydroOverlay,
  PlanningOverlayPolygon,
  PublicTransportLine,
  PublicTransportStop,
  TopographyOverlay,
  TransportRailLine,
  TransportRailStation,
} from "./explodedAxoOverlayFetch";
import type { AreaFeat, CityModel, Pt, TerrainField } from "../types";

export type ExplodedAxoOverlayBundle = {
  planning?: PlanningOverlayPolygon[] | "unavailable";
  transport?: {
    rail: { lines: TransportRailLine; stations: TransportRailStation[] };
    pt: { lines: PublicTransportLine[]; stops: PublicTransportStop[] } | null;
    /** NSW mode: which source supplied each part of the plate. */
    note?: string;
  } | "unavailable";
  hydro?: HydroOverlay | "unavailable";
  topography?: TopographyOverlay | "unavailable";
  /** Overture water polygons fetched for the frame when the model has none. */
  overtureWater?: AreaFeat[];
  /** Vicmap Parcel outlines for the cadastre plate. */
  cadastre?: CadastreOverlay | "unavailable";
  /** Mapterhorn terrain field for the terrain mesh plate when the model has none. */
  terrain?: TerrainField | "unavailable";
};

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
export const AXO_LAYER_IDS = [
  "planning",
  "water",
  "hydro",
  "transport",
  "topography",
  "terrain",
  "roads",
  "cadastre",
  "green",
  "trees",
  "buildings",
  "aerial",
  "base",
] as const;
export type AxoLayerId = (typeof AXO_LAYER_IDS)[number];

/** Layers that were in the original exploded axo release (default on). */
export const AXO_LEGACY_LAYER_IDS = ["water", "roads", "green", "buildings", "aerial"] as const satisfies readonly AxoLayerId[];

export const AXO_LAYER_LABELS: Record<AxoLayerId, string> = {
  planning: "PLANNING",
  water: "FLOODPLAIN",
  hydro: "HYDRO",
  transport: "TRANSPORT",
  topography: "TOPOGRAPHY",
  terrain: "TERRAIN",
  roads: "ROADS",
  cadastre: "CADASTRE",
  green: "GREEN SPACES",
  trees: "TREES",
  buildings: "BUILDINGS",
  aerial: "TERRAIN",
  base: "BASE OUTLINE",
};

export type AxoPaintKey =
  | "water"
  | "roads"
  | "green"
  | "buildings"
  | "plan-flood"
  | "plan-heritage"
  | "plan-ddo"
  | "plan-bmo"
  | "hydro-area"
  | "hydro-course"
  | "rail-line"
  | "rail-station"
  | "pt-train"
  | "pt-tram"
  | "pt-bus"
  | "contour"
  | "trees"
  | "cadastre"
  | "terrain-mesh"
  | "base-outline"
  | "building-roof"
  | "building-wall-light"
  | "building-wall-dark"
  | "tree-canopy"
  | "tree-canopy-shade"
  | "tree-trunk";

export type AxoLegendSwatch = { label: string; paint: AxoPaintKey };

export type AxoPointMarker = { x: number; y: number; paint: AxoPaintKey; radiusM: number };

/**
 * Default stack. Every listed layer keeps its lift slot even when hidden (so toggles never move
 * the view), so the reference-only base outline plate is left out and the default stack is unchanged.
 */
export const DEFAULT_AXO_LAYER_ORDER: AxoLayerId[] = [
  "planning",
  "water",
  "hydro",
  "transport",
  "roads",
  "cadastre",
  "green",
  "trees",
  "buildings",
  "terrain",
];

export type ExplodedAxoSettings = {
  layerOrder: AxoLayerId[];
  layerVisible: Record<AxoLayerId, boolean>;
  /** Vertical separation between layers, in local metres (iso lift). */
  gapM: number;
  showLabels: boolean;
  /** Vertical exaggeration of the terrain mesh plate (1 = true scale). */
  terrainExaggeration?: number;
  /** Extra vertical gap (iso metres) added directly above the named layer. */
  extraGapAboveM?: Partial<Record<AxoLayerId, number>>;
  /** Free-dragged lift overrides (iso metres). Cleared when the gap slider, stack order or a preset is applied. */
  layerLiftM?: Partial<Record<AxoLayerId, number>>;
  /** Draw buildings as extruded massing (walls + roofs). False keeps the flat footprint plate. */
  buildingMassing?: boolean;
  /** Draw trees as 3D canopies sized from crown data. False keeps flat crown discs. */
  treeCanopies?: boolean;
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
  const layerVisible: Record<AxoLayerId, boolean> = {
    planning: false,
    water: true,
    hydro: false,
    transport: false,
    topography: false,
    terrain: true,
    roads: true,
    cadastre: false,
    green: true,
    trees: true,
    buildings: true,
    aerial: false,
    base: false,
  };
  return {
    layerOrder: [...DEFAULT_AXO_LAYER_ORDER],
    layerVisible,
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
export function liftsForLayerOrder(
  order: AxoLayerId[],
  gapM: number,
  extraGapAboveM: Partial<Record<AxoLayerId, number>> = {},
  layerLiftM: Partial<Record<AxoLayerId, number>> = {},
): Map<AxoLayerId, number> {
  const bottomToTop = [...order].reverse();
  const lifts = new Map<AxoLayerId, number>();
  let lift = 0;
  bottomToTop.forEach((id, index) => {
    if (index > 0) lift += gapM + (extraGapAboveM[bottomToTop[index - 1]!] ?? 0);
    lifts.set(id, layerLiftM[id] ?? lift);
  });
  return lifts;
}

/** Moves `from` to the position of `to` in `order` (top → bottom). */
export function reorderAxoLayer(order: readonly AxoLayerId[], from: AxoLayerId, to: AxoLayerId): AxoLayerId[] {
  const next = [...order];
  const fromIdx = next.indexOf(from);
  const toIdx = next.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return next;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, from);
  return next;
}

/** Plates that carry the aerial image (#85 Esri World Imagery): the satellite plate and the reference base. */
export function axoPlateShowsAerial(id: AxoLayerId): boolean {
  return id === "terrain" || id === "aerial" || id === "base";
}

/** Kelvin's reference stack, top → bottom (Bern kakemono). */
export const AXO_REFERENCE_ORDER: AxoLayerId[] = [
  "trees",
  "buildings",
  "roads",
  "cadastre",
  "hydro",
  "terrain",
  "base",
];

/** Extra gap above the buildings plate in the reference preset, as a share of the normal gap. */
export const AXO_REFERENCE_BUILDING_GAP_FACTOR = 1.5;

/**
 * Reference preset: exactly the reference plates in the reference order (all visible), a bigger
 * gap above buildings, and the base outline plate. Other layers leave the stack (hidden layers
 * would still take lift slots); "Default stack" brings them back.
 */
export function referenceExplodedAxoSettings(sideM: number, current?: ExplodedAxoSettings): ExplodedAxoSettings {
  const defaults = defaultExplodedAxoSettings(sideM);
  const gapM = current?.gapM ?? defaults.gapM;
  const layerVisible = Object.fromEntries(
    AXO_LAYER_IDS.map((id) => [id, AXO_REFERENCE_ORDER.includes(id)]),
  ) as Record<AxoLayerId, boolean>;
  return {
    ...defaults,
    ...current,
    layerOrder: [...AXO_REFERENCE_ORDER],
    layerVisible,
    gapM,
    showLabels: true,
    extraGapAboveM: { buildings: gapM * AXO_REFERENCE_BUILDING_GAP_FACTOR },
  };
}

/** Painter's order: bottom layer first, top layer last (so water draws on top). */
export function axoLayersForPaint(layers: AxoLayerGeometry[]): AxoLayerGeometry[] {
  return [...layers].sort((a, b) => a.liftM - b.liftM);
}

/** Label beside the plate when geometry lives in a group with `axoLayerSvgTransform`. */
export function axoLayerLabelAnchorBase(sideM: number): { x: number; y: number; rotateDeg: number } {
  return axoLayerLabelAnchor(sideM, 0);
}

/** Keep axo plate labels upright; flip 180° when the edge direction points left. */
export function axoLabelRotationDeg(edgeDx: number, edgeDy: number): number {
  let deg = (Math.atan2(edgeDy, edgeDx) * 180) / Math.PI;
  if (edgeDx < 0) deg += 180;
  while (deg > 90) deg -= 180;
  while (deg <= -90) deg += 180;
  return deg;
}

export type AxoLayerLabelAnchor = {
  /** Text baseline start (horizontal text, left-aligned). */
  x: number;
  y: number;
  /** Always 0: labels are horizontal. Kept for callers that still pass a rotate(). */
  rotateDeg: number;
  /** Short leader from the plate's right corner to the label. */
  leader: { x1: number; y1: number; x2: number; y2: number };
};

/** Right-most point of the plate in iso (square corner or circle rim). */
export function axoPlateRightCorner(sideM: number, shape: SiteFrameShape, liftM: number): Pt {
  const half = sideM / 2;
  if (shape === "circle") {
    const k = half / Math.SQRT2;
    return planPointToIso(k, -k, liftM);
  }
  return planPointToIso(half, -half, liftM);
}

/** Horizontal label at the plate's right corner with a short leader line (per Kelvin's reference). */
export function axoLayerLabelAnchor(
  sideM: number,
  liftM: number,
  shape: SiteFrameShape = "square",
): AxoLayerLabelAnchor {
  const [x0, y0] = axoPlateRightCorner(sideM, shape, liftM);
  const leaderLen = sideM * 0.07;
  const fontM = sideM * 0.03;
  return {
    x: x0 + leaderLen + sideM * 0.012,
    y: y0 + fontM * 0.35,
    rotateDeg: 0,
    leader: { x1: x0 + sideM * 0.01, y1: y0, x2: x0 + leaderLen, y2: y0 },
  };
}

/** Plate label text as in the reference ("Trees.", "Buildings."). */
export function axoPlateLabelText(id: AxoLayerId): string {
  const raw = AXO_LAYER_LABELS[id];
  const title = raw.charAt(0) + raw.slice(1).toLowerCase();
  return `${title}.`;
}

export type AxoPlinthWall = {
  side: "left" | "right";
  d: string;
  fill: string;
  stroke: string;
  topPts: Pt[];
  bottomPts: Pt[];
};

export function axoGroundPlinthThicknessM(sideM: number): number {
  return Math.max(6, Math.min(80, roundIso(sideM * 0.04)));
}

/**
 * Vertical exaggeration for the 3D topographic ground surface on the bottom Satellite plate.
 * Uses explicit `terrainExaggeration` when set, or defaults to `DEFAULT_AXO_TERRAIN_EXAGGERATION`
 * clamped so peak relief never collides with the plate above.
 */
export function axoGroundTerrainExaggeration(
  _sideM: number,
  _gapM: number,
  field?: TerrainField | null,
  explicitExaggeration?: number,
): number {
  if (explicitExaggeration != null) return explicitExaggeration;
  if (!field || field.max - field.min <= 1e-3) return 1;
  return DEFAULT_AXO_TERRAIN_EXAGGERATION;
}

/**
 * Build the 3D ground base slab (topographic perimeter + front-left and front-right section walls)
 * under the bottom Satellite (`aerial`) plate in local iso coordinates (lift 0).
 * When `field` has relief, the top surface rim and wall top edges follow the 3D terrain elevation
 * `(sampleTerrain(field, e, n, sideM) - field.min) * exaggeration` while the base sits on `-slabThicknessM`.
 */
export function buildAxoGroundPlinth(
  sideM: number,
  shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
  field?: TerrainField | null,
  exaggeration = 1,
): {
  slabThicknessM: number;
  maxReliefM: number;
  frameD: string;
  walls: AxoPlinthWall[];
} {
  const half = sideM / 2;
  const slabThicknessM = axoGroundPlinthThicknessM(sideM);
  const baseZ = -slabThicknessM;
  const hasRelief = Boolean(field && field.max - field.min > 1e-3 && exaggeration > 0);
  const maxReliefM = hasRelief && field ? roundIso((field.max - field.min) * exaggeration) : 0;
  const elevationAt = (east: number, north: number): number =>
    hasRelief && field ? Math.max(0, (sampleTerrain(field, east, north, sideM) - field.min) * exaggeration) : 0;
  const fill = getColour("--ground-fill");
  const stroke = getColour("--ground-edge");

  if (shape === "circle") {
    const ring = openRing(circleRing(half, 64));
    const topPerimeterPts = ring.map(([e, n]) => planPointToIso(e, n, elevationAt(e, n)));
    const frameD = hasRelief ? isoSvgPolyline(topPerimeterPts, true) : axoPlateOutlineBaseD(sideM, shape);
    const leftSegs: [Pt, Pt][] = [];
    const rightSegs: [Pt, Pt][] = [];
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const mx = (a[0] + b[0]) * 0.5;
      const my = (a[1] + b[1]) * 0.5;
      if (mx + my <= 1e-9) continue;
      if (mx - my <= 0) leftSegs.push([a, b]);
      else rightSegs.push([a, b]);
    }
    const buildSideWall = (segs: [Pt, Pt][], side: "left" | "right"): AxoPlinthWall | null => {
      if (segs.length === 0) return null;
      let startIdx = 0;
      for (let i = 0; i < segs.length; i += 1) {
        const prev = segs[(i - 1 + segs.length) % segs.length]![1];
        const curr = segs[i]![0];
        if (Math.hypot(curr[0] - prev[0], curr[1] - prev[1]) > 1e-6) {
          startIdx = i;
          break;
        }
      }
      const orderedPts: Pt[] = [segs[startIdx]![0]];
      for (let k = 0; k < segs.length; k += 1) {
        const seg = segs[(startIdx + k) % segs.length]!;
        const last = orderedPts[orderedPts.length - 1]!;
        if (Math.hypot(seg[0][0] - last[0], seg[0][1] - last[1]) > 1e-6) {
          orderedPts.push(seg[0]);
        }
        orderedPts.push(seg[1]);
      }
      const topPts = orderedPts.map(([e, n]) => planPointToIso(e, n, elevationAt(e, n)));
      const bottomPts = [...orderedPts].reverse().map(([e, n]) => planPointToIso(e, n, baseZ));
      return {
        side,
        d: isoSvgPolyline([...topPts, ...bottomPts], true),
        fill,
        stroke,
        topPts,
        bottomPts,
      };
    };
    const walls: AxoPlinthWall[] = [];
    const leftWall = buildSideWall(leftSegs, "left");
    const rightWall = buildSideWall(rightSegs, "right");
    if (leftWall) walls.push(leftWall);
    if (rightWall) walls.push(rightWall);
    return { slabThicknessM, maxReliefM, frameD, walls };
  }

  const edgeSteps = hasRelief && field ? 40 : 1;
  const corners: Pt[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const topPerimeterPts: Pt[] = [];
  for (let c = 0; c < 4; c += 1) {
    const a = corners[c]!;
    const b = corners[(c + 1) % 4]!;
    for (let s = 0; s < edgeSteps; s += 1) {
      const t = s / edgeSteps;
      const e = a[0] + (b[0] - a[0]) * t;
      const n = a[1] + (b[1] - a[1]) * t;
      topPerimeterPts.push(planPointToIso(e, n, elevationAt(e, n)));
    }
  }
  const frameD = hasRelief ? isoSvgPolyline(topPerimeterPts, true) : axoPlateOutlineBaseD(sideM, shape);
  const edges: { side: "left" | "right"; a: Pt; b: Pt }[] = [
    { side: "left", a: [-half, half], b: [half, half] },
    { side: "right", a: [half, half], b: [half, -half] },
  ];
  const walls: AxoPlinthWall[] = [];
  for (const { side, a, b } of edges) {
    const topPts: Pt[] = [];
    for (let s = 0; s <= edgeSteps; s += 1) {
      const t = s / edgeSteps;
      const e = a[0] + (b[0] - a[0]) * t;
      const n = a[1] + (b[1] - a[1]) * t;
      topPts.push(planPointToIso(e, n, elevationAt(e, n)));
    }
    const bottomPts: Pt[] = [
      planPointToIso(b[0], b[1], baseZ),
      planPointToIso(a[0], a[1], baseZ),
    ];
    walls.push({
      side,
      d: isoSvgPolyline([...topPts, ...bottomPts], true),
      fill,
      stroke,
      topPts,
      bottomPts,
    });
  }
  return {
    slabThicknessM,
    maxReliefM,
    frameD,
    walls,
  };
}

export function buildAxoGroundTopoContours(
  model: CityModel,
  field?: TerrainField | null,
  exaggeration = DEFAULT_AXO_TERRAIN_EXAGGERATION,
  topoOverlay?: TopographyOverlay | "unavailable",
): string[] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const hasFieldRelief = Boolean(field && field.max - field.min > 1e-3 && exaggeration > 0);
  const rawPolylines: Pt[][] = [];
  if (hasFieldRelief && field) {
    const contourLayer = demContourLayer(field, model.sideM);
    for (const line of contourLayer.lines) {
      rawPolylines.push(line.points);
    }
  } else if (topoOverlay && topoOverlay !== "unavailable" && topoOverlay.contours.length > 0) {
    for (const c of topoOverlay.contours) {
      rawPolylines.push(c.line);
    }
  }
  if (rawPolylines.length === 0) return [];
  const stepM = Math.max(1.5, model.sideM / 80);
  const elevationAt = (e: number, n: number): number =>
    hasFieldRelief && field
      ? Math.max(0, (sampleTerrain(field, e, n, model.sideM) - field.min) * exaggeration)
      : 0;
  const out: string[] = [];
  for (const poly of rawPolylines) {
    for (const part of clipPolylineSiteFrame(dedupe(poly), model.sideM, shape)) {
      if (part.length < 2) continue;
      const dense: Pt[] = [part[0]!];
      for (let i = 0; i < part.length - 1; i += 1) {
        const a = part[i]!;
        const b = part[i + 1]!;
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(1, Math.ceil(dist / stepM));
        for (let s = 1; s <= steps; s += 1) {
          const t = s / steps;
          dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      const pts = dense.map(([e, n]) => planPointToIso(e, n, elevationAt(e, n)));
      const d = isoSvgPolyline(pts, false);
      if (d) out.push(d);
    }
  }
  return out;
}

export type AxoLayerGeometry = {
  id: AxoLayerId;
  liftM: number;
  /** Filled regions as SVG d strings (evenodd). */
  fills: string[];
  /** Stroked centre lines (roads). */
  strokes: string[];
  /** Optional paint key per fill/stroke (defaults to the layer base colour). */
  fillPaints?: AxoPaintKey[];
  strokePaints?: AxoPaintKey[];
  strokeWidthScales?: number[];
  /** When true, the stroke at the same index is dashed (e.g. tram routes). */
  strokeDashed?: boolean[];
  markers?: AxoPointMarker[];
  /** Frame plate outline at this lift. */
  plateOutlineD: string;
  /** Clip path d (same as plate interior). */
  clipD: string;
  unavailableNote?: string;
  legend?: AxoLegendSwatch[];
  /** Strokes drawn without the plate clip (terrain mesh rises above the plate). */
  unclippedStrokes?: string[];
  /**
   * Extruded solids (building massing) in painter's order, far to near. Drawn after the
   * plate fills and not clipped to the plate, so tall masses can rise above it.
   */
  solids?: AxoSolidFace[];
  /** Visible source note for this plate (e.g. where heights came from). */
  sourceNote?: string;
  /** 3D ground base slab (plinth) vertical walls underneath the satellite plate. */
  plinthWalls?: AxoPlinthWall[];
  /** Plinth slab depth in local metres when this plate carries a 3D base slab. */
  plinthThicknessM?: number;
  /** Peak 3D terrain relief above the plate base on the bottom topography/satellite plate. */
  plinthMaxReliefM?: number;
  /** Vertical exaggeration applied to the bottom topography/satellite plate. */
  plinthExaggeration?: number;
  /** 3D topographic contour polylines draped over the bottom satellite topography surface. */
  topoContourStrokes?: string[];
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
    if (!isVehicularRoad(road)) continue;
    for (const part of clipPolylineSiteFrame(dedupe(road.line), model.sideM, shape)) {
      const simplified = simplifyLine(part, 120);
      if (simplified.length >= 2) lines.push(simplified);
    }
  }
  return lines;
}

/** True when at least one model water polygon survives site-frame clipping. */
export function modelHasClippedWaterInFrame(model: CityModel): boolean {
  return areaRings(model, "water").length > 0;
}

const HYDRO_COURSE_BUFFER_HALF_M = 38;

function hydroCourseFillRings(courses: Pt[][], sideM: number, shape: SiteFrameShape): Pt[][][] {
  const out: Pt[][][] = [];
  for (const line of courses) {
    const ring = bufferOpenLine(line, HYDRO_COURSE_BUFFER_HALF_M);
    if (!ring) continue;
    const clipped = clipAreaToSiteFrame(ring, [], sideM, shape);
    if (!clipped || Math.abs(signedArea(clipped[0]!)) < 80) continue;
    out.push(clipped);
  }
  return out;
}

function waterAreaRings(model: CityModel, overlays: ExplodedAxoOverlayBundle): Pt[][][] {
  const fromModel = areaRings(model, "water");
  if (fromModel.length > 0) return fromModel;
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const extra = overlays.overtureWater ?? [];
  const out: Pt[][][] = [];
  for (const area of extra) {
    if (area.kind !== "water") continue;
    const rings = clipAreaToSiteFrame(area.ring, area.holes, model.sideM, shape);
    if (rings) out.push(rings);
  }
  return out;
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

function pushAreaPaths(
  ringsList: Pt[][][],
  fills: string[],
  fillPaints: AxoPaintKey[],
  paint: AxoPaintKey,
  areaToPath: (rings: Pt[][]) => string,
) {
  for (const rings of ringsList) {
    const d = areaToPath(rings);
    if (d) {
      fills.push(d);
      fillPaints.push(paint);
    }
  }
}

function pushLinePaths(
  lines: Pt[][],
  strokes: string[],
  strokePaints: AxoPaintKey[],
  strokeWidthScales: number[],
  strokeDashed: boolean[],
  paint: AxoPaintKey,
  widthScale = 1,
  dashed = false,
) {
  for (const line of lines) {
    const pts = line.map(([e, n]) => planToIsoBase(e, n));
    strokes.push(isoSvgPolyline(pts, false));
    strokePaints.push(paint);
    strokeWidthScales.push(widthScale);
    strokeDashed.push(dashed);
  }
}

function planningPaint(kind: PlanningOverlayPolygon["kind"]): AxoPaintKey {
  if (kind === "flood") return "plan-flood";
  if (kind === "heritage") return "plan-heritage";
  if (kind === "ddo") return "plan-ddo";
  return "plan-bmo";
}

function ptPaint(mode: PublicTransportLine["mode"], kind: "line" | "stop"): AxoPaintKey {
  if (mode === "train") return "pt-train";
  if (mode === "tram") return "pt-tram";
  if (mode === "bus") return "pt-bus";
  return kind === "line" ? "rail-line" : "rail-station";
}

export function buildExplodedAxoLayers(
  model: CityModel,
  settings: ExplodedAxoSettings,
  overlays: ExplodedAxoOverlayBundle = {},
): { layers: AxoLayerGeometry[]; guides: AxoGuideLine[] } {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const lifts = liftsForLayerOrder(settings.layerOrder, settings.gapM, settings.extraGapAboveM, settings.layerLiftM);
  const visibleLifts = settings.layerOrder
    .filter((id) => settings.layerVisible[id])
    .map((id) => lifts.get(id)!);

  const overtureWaterAreas = waterAreaRings(model, overlays);
  const greenAreas = areaRings(model, "green");
  const roadLines = clipRoadLines(model);

  const layers: AxoLayerGeometry[] = [];

  for (const id of settings.layerOrder) {
    if (!settings.layerVisible[id]) continue;
    const liftM = lifts.get(id)!;
    let plateOutlineD = axoPlateOutlineBaseD(model.sideM, shape);
    let clipD = plateOutlineD;
    const fills: string[] = [];
    const strokes: string[] = [];
    const fillPaints: AxoPaintKey[] = [];
    const strokePaints: AxoPaintKey[] = [];
    const strokeWidthScales: number[] = [];
    const strokeDashed: boolean[] = [];
    const markers: AxoPointMarker[] = [];
    let unavailableNote: string | undefined;
    let legend: AxoLegendSwatch[] | undefined;
    let unclippedStrokes: string[] | undefined;
    let solids: AxoSolidFace[] | undefined;
    let sourceNote: string | undefined;
    let plinthWalls: AxoPlinthWall[] | undefined;
    let plinthThicknessM: number | undefined;
    let plinthMaxReliefM: number | undefined;
    let plinthExaggeration: number | undefined;
    let topoContourStrokes: string[] | undefined;

    const areaToPath = (rings: Pt[][]) =>
      rings
        .map((ring) => isoPathFromPlanRingBase(openRing(ring), true))
        .filter(Boolean)
        .join(" ");

    if (id === "planning") {
      if (overlays.planning === "unavailable") {
        unavailableNote = "unavailable";
      } else if (overlays.planning?.length) {
        for (const poly of overlays.planning) {
          const rings = clipAreaToSiteFrame(poly.outer, poly.holes, model.sideM, shape);
          if (!rings) continue;
          const d = areaToPath(rings);
          if (d) {
            fills.push(d);
            fillPaints.push(planningPaint(poly.kind));
          }
        }
        legend = [
          { label: "Flood (LSIO/SBO/FO)", paint: "plan-flood" },
          { label: "Heritage (HO)", paint: "plan-heritage" },
          { label: "DDO", paint: "plan-ddo" },
          { label: "BMO", paint: "plan-bmo" },
        ];
      }
    } else if (id === "water" || id === "hydro") {
      const hydro = overlays.hydro !== "unavailable" ? overlays.hydro : undefined;
      const hydroAreas = hydro?.areas.map((poly) => [poly.outer, ...poly.holes]) ?? [];
      if (hydroAreas.length > 0) {
        pushAreaPaths(hydroAreas, fills, fillPaints, "hydro-area", areaToPath);
      } else {
        pushAreaPaths(overtureWaterAreas, fills, fillPaints, "water", areaToPath);
      }
      if (hydro?.courses.length) {
        if (fills.length === 0) {
          pushAreaPaths(
            hydroCourseFillRings(hydro.courses, model.sideM, shape),
            fills,
            fillPaints,
            id === "water" ? "water" : "hydro-area",
            areaToPath,
          );
        }
        pushLinePaths(
          hydro.courses,
          strokes,
          strokePaints,
          strokeWidthScales,
          strokeDashed,
          "hydro-course",
          fills.length ? 0.95 : 2.4,
        );
      }
      if (fills.length === 0 && strokes.length === 0) {
        if (overlays.hydro === "unavailable" && overtureWaterAreas.length === 0) unavailableNote = "unavailable";
      }
    } else if (id === "transport") {
      if (overlays.transport === "unavailable") {
        unavailableNote = "unavailable";
      } else if (overlays.transport) {
        // Rail, train and tram lines are not drawn on the exploded axo: they show only in the 3D view and on
        // the site plan. Stations, stops and bus routes stay.
        for (const station of overlays.transport.rail.stations) {
          const [x, y] = planToIsoBase(station[0], station[1]);
          markers.push({ x, y, paint: "rail-station", radiusM: model.sideM * 0.0045 });
        }
        for (const line of overlays.transport.pt?.lines ?? []) {
          if (line.mode === "other" || line.mode === "train" || line.mode === "tram") continue;
          pushLinePaths([line.line], strokes, strokePaints, strokeWidthScales, strokeDashed, ptPaint(line.mode, "line"), 0.7);
        }
        for (const stop of overlays.transport.pt?.stops ?? []) {
          if (stop.mode === "other") continue;
          const [x, y] = planToIsoBase(stop.point[0], stop.point[1]);
          markers.push({ x, y, paint: ptPaint(stop.mode, "stop"), radiusM: model.sideM * 0.0038 });
        }
        if (overlays.transport.note) sourceNote = overlays.transport.note;
        // No "Rail" swatch: no rail lines are drawn. Train and Tram now key the stop markers.
        legend = [
          { label: "Train", paint: "pt-train" },
          { label: "Tram", paint: "pt-tram" },
          { label: "Bus", paint: "pt-bus" },
        ];
      }
    } else if (id === "topography") {
      if (overlays.topography === "unavailable") {
        unavailableNote = "unavailable";
      } else if (overlays.topography?.contours.length) {
        pushLinePaths(
          overlays.topography.contours.map((item) => item.line),
          strokes,
          strokePaints,
          strokeWidthScales,
          strokeDashed,
          "contour",
          0.55,
          true,
        );
      }
    } else if (id === "cadastre") {
      if (overlays.cadastre === "unavailable") {
        unavailableNote = AXO_CADASTRE_UNAVAILABLE_NOTE;
      } else if (overlays.cadastre) {
        for (const rings of overlays.cadastre.parcels) {
          for (const ring of rings) {
            const d = isoPathFromPlanRingBase(openRing(ring), true);
            if (!d) continue;
            strokes.push(d);
            strokePaints.push("cadastre");
            strokeWidthScales.push(0.35);
            strokeDashed.push(false);
          }
        }
        sourceNote = axoCadastreNote(overlays.cadastre);
      }
    } else if (id === "base") {
      for (const [east, north] of axoGuideAnchorPoints(model.sideM, shape)) {
        const [x, y] = planToIsoBase(east, north);
        markers.push({ x, y, paint: "base-outline", radiusM: model.sideM * 0.006 });
      }
    } else if (id === "green") {
      for (const rings of greenAreas) {
        const d = areaToPath(rings);
        if (d) fills.push(d);
      }
    } else if (id === "trees" && settings.treeCanopies !== false) {
      const canopies = buildAxoCanopyFaces(model);
      solids = canopies.faces;
      sourceNote = axoCanopyNote(canopies.counts) || undefined;
    } else if (id === "trees") {
      for (const tree of model.trees) {
        if (!pointInSiteFrame(tree.at, model.sideM, shape)) continue;
        const [x, y] = planToIsoBase(tree.at[0], tree.at[1]);
        markers.push({
          x,
          y,
          paint: "trees",
          radiusM: Math.max(0.4, tree.crown_diameter_m / 2),
        });
      }
    } else if (id === "buildings") {
      if (settings.buildingMassing === false) {
        const ground = figureGround(model.buildings, model.sideM, shape);
        for (const polygon of ground.polygons) {
          const parts = polygon
            .map((ring) => isoPathFromPlanRingBase(openRing(ring), true))
            .filter(Boolean);
          if (parts.length) fills.push(parts.join(" "));
        }
      } else {
        const massing = buildAxoMassingFaces(model);
        solids = massing.faces;
        sourceNote = axoMassingHeightNote(massing.counts) || undefined;
      }
    } else if (id === "roads") {
      for (const line of roadLines) {
        const pts = line.map(([e, n]) => planToIsoBase(e, n));
        strokes.push(isoSvgPolyline(pts, false));
      }
    } else if (id === "terrain" || id === "aerial") {
      const terrainField = model.terrain ?? (overlays.terrain !== "unavailable" ? overlays.terrain : undefined);
      const terrainEx = axoGroundTerrainExaggeration(
        model.sideM,
        settings.gapM,
        terrainField,
        settings.terrainExaggeration,
      );
      const plinth = buildAxoGroundPlinth(model.sideM, shape, terrainField, terrainEx);
      plateOutlineD = plinth.frameD;
      clipD = plinth.frameD;
      plinthWalls = plinth.walls;
      plinthThicknessM = plinth.slabThicknessM;
      plinthMaxReliefM = plinth.maxReliefM;
      plinthExaggeration = terrainEx;
      if (terrainField) {
        unclippedStrokes = buildAxoTerrainMesh(model, terrainField, terrainEx);
        sourceNote = axoTerrainNote(terrainField, terrainEx);
      } else if (overlays.terrain === "unavailable") {
        unavailableNote = AXO_TERRAIN_UNAVAILABLE_NOTE;
      }
      const contours = buildAxoGroundTopoContours(model, terrainField, terrainEx, overlays.topography);
      if (contours.length > 0) {
        topoContourStrokes = contours;
      }
    }

    layers.push({
      id,
      liftM,
      fills,
      strokes,
      ...(fillPaints.length ? { fillPaints } : {}),
      ...(strokePaints.length ? { strokePaints, strokeWidthScales, strokeDashed } : {}),
      ...(markers.length ? { markers } : {}),
      plateOutlineD,
      clipD,
      ...(unavailableNote ? { unavailableNote } : {}),
      ...(legend ? { legend } : {}),
      ...(unclippedStrokes?.length ? { unclippedStrokes } : {}),
      ...(solids?.length ? { solids } : {}),
      ...(sourceNote ? { sourceNote } : {}),
      ...(plinthWalls?.length ? { plinthWalls, plinthThicknessM, plinthMaxReliefM, plinthExaggeration } : {}),
      ...(topoContourStrokes?.length ? { topoContourStrokes } : {}),
    });
  }

  return { layers, guides: axoGuideLines(model.sideM, shape, visibleLifts) };
}

const AXO_PAINT_CSS: Record<AxoPaintKey, ColourKey> = {
  water: "--axo-water",
  roads: "--axo-road",
  green: "--axo-green",
  buildings: "--axo-building",
  "plan-flood": "--axo-plan-flood",
  "plan-heritage": "--axo-plan-heritage",
  "plan-ddo": "--axo-plan-ddo",
  "plan-bmo": "--axo-plan-bmo",
  "hydro-area": "--axo-hydro-area",
  "hydro-course": "--axo-hydro-course",
  "rail-line": "--axo-rail-line",
  "rail-station": "--axo-rail-station",
  "pt-train": "--axo-pt-train",
  "pt-tram": "--axo-pt-tram",
  "pt-bus": "--axo-pt-bus",
  contour: "--axo-contour",
  trees: "--tree-fill",
  cadastre: "--axo-cadastre",
  "terrain-mesh": "--axo-terrain-mesh",
  "base-outline": "--axo-base-outline",
  "building-roof": "--axo-building-roof",
  "building-wall-light": "--axo-building-wall-light",
  "building-wall-dark": "--axo-building-wall-dark",
  "tree-canopy": "--axo-tree-canopy",
  "tree-canopy-shade": "--axo-tree-canopy-shade",
  "tree-trunk": "--axo-tree-trunk",
};

export function axoPaintColour(paint: AxoPaintKey): string {
  return getColour(AXO_PAINT_CSS[paint]);
}

export function axoLayerBasePaint(id: AxoLayerId): AxoPaintKey {
  if (id === "water" || id === "hydro") return "water";
  if (id === "roads") return "roads";
  if (id === "cadastre") return "cadastre";
  if (id === "green") return "green";
  if (id === "trees") return "trees";
  if (id === "buildings" || id === "aerial") return "buildings";
  if (id === "topography") return "contour";
  if (id === "terrain") return "terrain-mesh";
  if (id === "base") return "base-outline";
  if (id === "transport") return "rail-line";
  return "plan-flood";
}

export function axoLayerColours(): Record<AxoLayerId | "guide" | "label", string> {
  return {
    planning: getColour("--axo-plan-heritage"),
    water: getColour("--axo-water"),
    hydro: getColour("--axo-hydro-area"),
    transport: getColour("--axo-rail-line"),
    topography: getColour("--axo-contour"),
    terrain: getColour("--axo-terrain-mesh"),
    roads: getColour("--axo-road"),
    cadastre: getColour("--axo-cadastre"),
    green: getColour("--axo-green"),
    trees: getColour("--tree-fill"),
    buildings: getColour("--axo-building"),
    aerial: getColour("--axo-building"),
    base: getColour("--axo-base-outline"),
    guide: getColour("--axo-guide"),
    label: getColour("--axo-label"),
  };
}

/** Per-layer plate tint (fill) and edge colours, from colours.css tokens. */
export function axoPlateColours(id: AxoLayerId): { tint: string; edge: string } {
  return {
    tint: getColour(`--axo-plate-${id}` as ColourKey),
    edge: getColour(`--axo-edge-${id}` as ColourKey),
  };
}

/** Opacity of the plate tint on screen, so lower plates still read through (reference look). */
export const AXO_PLATE_TINT_OPACITY = 0.55;

/** Hatch pattern ids for planning fills (referenced from SVG defs). */
export const AXO_HATCH_PAINTS: AxoPaintKey[] = ["plan-flood", "plan-heritage", "plan-ddo", "plan-bmo"];

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
  const stackSettings: ExplodedAxoSettings = {
    ...settings,
    layerVisible: Object.fromEntries(settings.layerOrder.map((id) => [id, true])) as Record<AxoLayerId, boolean>,
  };
  const { layers, guides } = buildExplodedAxoLayers(model, stackSettings);
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
      if (layer.plinthThicknessM) {
        const [bx, by] = planPointToIso(pt[0], pt[1], layer.liftM - layer.plinthThicknessM);
        bump(bx, by);
      }
    }
    const label = axoLayerLabelAnchor(model.sideM, layer.liftM, model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE);
    bump(label.x, label.y);
    bump(label.x + model.sideM * 0.22, label.y);
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
