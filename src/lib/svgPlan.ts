import type { BuildingColourMode } from "./buildingViewportColor";
import { planBuildingFill } from "./planBuildingFill";
import { isSiteBuilding } from "./siteBuildings";
import { clipAreaToSiteFrame, clipPolylineSiteFrame, pointInSiteFrame, DEFAULT_SITE_FRAME_SHAPE } from "./siteFrame";
import { openRing } from "./geo";
import { PATH_WIDTH_M } from "./lineweights";
import type { MultiPolygon } from "polygon-clipping";
import {
  DEFAULT_PATH_FILLET_M,
  footpathStrips,
  footpathDisplayAfterRoadBlockers,
  footpathFillDisplayPolygons,
  mergeFootpathFragments,
  roadFillDisplayPolygons,
  subtractFootpathBlockers,
  unionFootpathStrips,
  unionFootpathStripsForPlanSmooth,
  unionRoadSurface,
  unionRoadSurfaceForPlanSmooth,
  type PlanFillQuality,
} from "./roadFill";
import {
  DEFAULT_COARSE_FROM_SCALE,
  DEFAULT_COARSE_INTERVAL_M,
  altitudeOnInterval,
  demContourLayer,
  drawContours,
  drawnContourInterval,
} from "./vicmapContours";
import type { CityModel, Pt } from "../types";
import type { PlanSmoothRoadFill, RoadFill } from "./roadFill";

type PlanUnionFill = RoadFill | PlanSmoothRoadFill;

/** Fast / main first-paint precision for plan path `d` coordinates. */
export const PLAN_COORD_ROUND_M = 0.1;
/** Smooth plan and export precision (finer arcs; not on first-paint path). */
export const PLAN_COORD_ROUND_SMOOTH_M = 0.01;

export function roundPlanCoordAt(value: number, roundM: number): number {
  if (roundM === 0.1) return Math.round(value * 10) / 10;
  if (roundM === 0.01) return Math.round(value * 100) / 100;
  const scale = 1 / roundM;
  return Math.round(value * scale) / scale;
}

/** Format a plan SVG coordinate without float noise (matches main at 0.1 m). */
export function formatPlanSvgCoord(value: number, coordRoundM: number): string {
  const rounded = roundPlanCoordAt(value, coordRoundM);
  if (coordRoundM === 0.1) {
    const tenths = Math.round(rounded * 10);
    return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
  }
  if (coordRoundM === 0.01) {
    const hundredths = Math.round(rounded * 100);
    if (hundredths % 100 === 0) return String(hundredths / 100);
    if (hundredths % 10 === 0) return (hundredths / 100).toFixed(1);
    return (hundredths / 100).toFixed(2);
  }
  return String(rounded);
}

export function roundPlanCoord(value: number): number {
  return roundPlanCoordAt(value, PLAN_COORD_ROUND_M);
}

export function planPathCoordRoundM(quality: PlanFillQuality): number {
  return quality === "smooth" ? PLAN_COORD_ROUND_SMOOTH_M : PLAN_COORD_ROUND_M;
}

export function svgPolyline(points: Pt[], close: boolean, coordRoundM = PLAN_COORD_ROUND_M): string {
  if (points.length < 2) return "";
  const body = points
    .map((point, index) => {
      const x = formatPlanSvgCoord(point[0], coordRoundM);
      const y = formatPlanSvgCoord(-point[1], coordRoundM);
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return close ? `${body} Z` : body;
}

export function svgRings(rings: Pt[][], coordRoundM = PLAN_COORD_ROUND_M): string {
  return rings
    .map((ring) => svgPolyline(openRing(ring), true, coordRoundM))
    .filter(Boolean)
    .join(" ");
}

/** Road and path fill `d` strings as drawn on the site plan (first-paint layers). */
export function planRoadPathFillDs(plan: PlanPaths): string {
  const roundM = plan.coordRoundM;
  const road = plan.roadFill.map((polygon) => svgRings(polygon, roundM)).join(" ");
  const path = plan.pathFill.map((polygon) => svgRings(polygon, roundM)).join(" ");
  return `${road}\n${path}`;
}

export type PlanPaths = {
  blocks: Pt[][][];
  green: Pt[][][];
  water: Pt[][][];
  /** Unioned carriageway, outer rings plus block holes, in local east/north metres. */
  roadFill: Pt[][][];
  /** Reserved; always empty (green stays below roads, matching main). */
  greenOnRoad: Pt[][][];
  /** Buffer and union time for the carriageway, in milliseconds. */
  roadUnionMs: number;
  /** Unioned footpath strip. Outer rings plus holes, in local east/north metres. */
  pathFill: Pt[][][];
  /** Buffer and union time for the footpath strip, in milliseconds. */
  pathUnionMs: number;
  rails: Pt[][];
  trams: Pt[][];
  buildings: { rings: Pt[][]; fill: string; site: boolean }[];
  trees: { east: number; north: number; r: number }[];
  contours: Pt[][];
  /** Parallel to `contours`. True on every Nth interval. */
  contourIndex: boolean[];
  /** Elevation labels for index contours only. */
  contourLabels: { east: number; north: number; text: string }[];
  contourInterval: number | null;
  contourSource: "vicmap-metro" | "vicmap-state" | "dem" | null;
  ringSmoothMs?: number;
  /** SVG `d` coordinate quantisation for this plan (0.1 m fast, 0.01 m smooth). */
  coordRoundM: number;
};

function dedupe(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of line) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.05) out.push(point);
  }
  return out;
}

function leftNormal(dir: Pt): Pt {
  return [-dir[1], dir[0]];
}

function direction(a: Pt, b: Pt): Pt | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  return [dx / length, dy / length];
}

/** Open polyline offset to the left of its direction. A negative distance offsets to the right. */
export function offsetPolyline(line: Pt[], distance: number): Pt[] {
  const pts = dedupe(line);
  if (pts.length < 2) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const incoming = i > 0 ? direction(pts[i - 1], pts[i]) : null;
    const outgoing = i < pts.length - 1 ? direction(pts[i], pts[i + 1]) : null;
    const n1 = incoming ? leftNormal(incoming) : null;
    const n2 = outgoing ? leftNormal(outgoing) : null;
    let nx = 0;
    let ny = 0;
    let scale = 1;
    if (n1 && n2) {
      nx = n1[0] + n2[0];
      ny = n1[1] + n2[1];
      const length = Math.hypot(nx, ny);
      if (length < 0.25) {
        nx = n1[0];
        ny = n1[1];
      } else {
        nx /= length;
        ny /= length;
        const dot = n1[0] * nx + n1[1] * ny;
        scale = dot > 0.35 ? Math.min(2.2, 1 / dot) : 1;
      }
    } else {
      const normal = n2 ?? n1;
      if (!normal) continue;
      nx = normal[0];
      ny = normal[1];
    }
    out.push([pts[i][0] + nx * distance * scale, pts[i][1] + ny * distance * scale]);
  }
  return out;
}

function clipRings(outer: Pt[], holes: Pt[][], sideM: number, frameShape: import("../types").SiteFrameShape): Pt[][] | null {
  return clipAreaToSiteFrame(outer, holes, sideM, frameShape);
}

function clipLines(line: Pt[], sideM: number, frameShape: import("../types").SiteFrameShape): Pt[][] {
  return clipPolylineSiteFrame(dedupe(line), sideM, frameShape).map(dedupe).filter((part) => part.length >= 2);
}

export type PlanPathQuality = PlanFillQuality;

export type PlanPathOptions = {
  buildingColour?: BuildingColourMode;
  highlightManual?: boolean;
  pathFilletM?: number;
  /** When set, overrides legacy `smoothOutput` for road/path fill quality. */
  quality?: PlanPathQuality;
  smoothOutput?: boolean;
  /** Densify road/path centrelines before buffering (default true). */
  centrelineSmooth?: boolean;
};

export function resolvePlanPathQuality(planOptions: PlanPathOptions = {}): PlanPathQuality {
  if (planOptions.quality) return planOptions.quality;
  if (planOptions.smoothOutput === false) return "fast";
  return "smooth";
}

export type PlanPathsBuildArgs = {
  pathWidthM?: number;
  contourIndexEvery?: number;
  planScale?: number;
  coarseIntervalM?: number;
  coarseFromScale?: number;
  planOptions?: PlanPathOptions;
};

function planRoadAndPathFills(
  quality: PlanFillQuality,
  carriageway: PlanUnionFill,
  footpaths: PlanUnionFill,
  pathFilletM: number,
): { roadFillPolys: MultiPolygon; pathFill: MultiPolygon } {
  if (quality === "fast") {
    let pathFill = footpaths.polygons;
    if (pathFilletM > 0 && carriageway.polygons.length > 0) {
      pathFill = subtractFootpathBlockers(pathFill, carriageway.polygons);
      pathFill = mergeFootpathFragments(pathFill);
    }
    return { roadFillPolys: carriageway.polygons, pathFill };
  }
  const roadFillPolys = roadFillDisplayPolygons(carriageway);
  let pathFill = footpathFillDisplayPolygons(footpaths);
  if (pathFilletM > 0 && roadFillPolys.length > 0) {
    pathFill = footpathDisplayAfterRoadBlockers(footpathFillDisplayPolygons(footpaths), roadFillPolys);
  }
  return { roadFillPolys, pathFill };
}

export function assemblePlanPaths(
  model: CityModel,
  footpaths: PlanUnionFill,
  carriageway: PlanUnionFill,
  _pathWidthM: number,
  contourIndexEvery: number,
  planScale: number,
  coarseIntervalM: number,
  coarseFromScale: number,
  planOptions: PlanPathOptions,
  preamble: {
    blocks: Pt[][][];
    green: Pt[][][];
    water: Pt[][][];
    rails: PlanPaths["rails"];
    trams: PlanPaths["trams"];
  },
): PlanPaths {
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const pathFilletM =
    planOptions.pathFilletM !== undefined ? planOptions.pathFilletM : DEFAULT_PATH_FILLET_M;
  const quality = resolvePlanPathQuality(planOptions);
  const { roadFillPolys, pathFill } = planRoadAndPathFills(quality, carriageway, footpaths, pathFilletM);

  const colourMode: BuildingColourMode = planOptions.buildingColour ?? {
    colourByUse: true,
    uniformBuildings: false,
    colourBySource: false,
  };
  const highlightManual = Boolean(planOptions.highlightManual);
  const buildings = model.buildings
    .map((building) => {
      const rings = clipRings(building.ring, building.holes, model.sideM, frameShape);
      if (!rings) return null;
      const site = isSiteBuilding(model, building.id);
      const fill = planBuildingFill(model, building, colourMode, highlightManual);
      return { rings, fill, site };
    })
    .filter((building): building is { rings: Pt[][]; fill: string; site: boolean } => building !== null);

  const trees = model.trees
    .filter((tree) => pointInSiteFrame(tree.at, model.sideM, frameShape))
    .map((tree) => ({
      east: tree.at[0],
      north: tree.at[1],
      r: tree.crown_diameter_m / 2,
    }));

  const layer =
    model.contours === false
      ? null
      : model.contourLayer
        ? model.contourLayer
        : model.contours && model.terrain
          ? demContourLayer(model.terrain, model.sideM)
          : null;
  const clipped = layer
    ? layer.lines.flatMap((line) =>
        clipLines(line.points, model.sideM, frameShape).map((points) => ({ points, z: line.z })),
      )
    : [];
  const drawnInterval = layer
    ? drawnContourInterval(layer.source, layer.interval, planScale, coarseIntervalM, coarseFromScale)
    : 0;
  const visible =
    layer && drawnInterval > layer.interval
      ? clipped.filter((line) => altitudeOnInterval(line.z, drawnInterval))
      : clipped;
  const drawn = layer && visible.length > 0 ? drawContours(visible, drawnInterval, contourIndexEvery) : null;

  return {
    blocks: preamble.blocks,
    green: preamble.green,
    greenOnRoad: [],
    water: preamble.water,
    roadFill: roadFillPolys,
    roadUnionMs: carriageway.ms,
    pathFill,
    pathUnionMs: footpaths.ms,
    rails: preamble.rails,
    trams: preamble.trams,
    buildings,
    trees,
    contours: drawn ? drawn.lines.map((line) => line.points) : [],
    contourIndex: drawn ? drawn.lines.map((line) => line.index) : [],
    contourLabels: [],
    contourInterval: drawn && layer ? drawnInterval : null,
    contourSource: drawn && layer ? layer.source : null,
    ringSmoothMs: quality === "smooth" ? 0 : undefined,
    coordRoundM: planPathCoordRoundM(quality),
  };
}

export function planPathsPreamble(model: CityModel): {
  blocks: Pt[][][];
  green: Pt[][][];
  water: Pt[][][];
  rails: PlanPaths["rails"];
  trams: PlanPaths["trams"];
  frameShape: import("../types").SiteFrameShape;
} {
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const blocks: Pt[][][] = [];
  const green: Pt[][][] = [];
  const water: Pt[][][] = [];
  for (const area of model.blocks ?? []) {
    const rings = clipRings(area.ring, area.holes, model.sideM, frameShape);
    if (rings) blocks.push(rings);
  }
  for (const area of model.areas) {
    if (area.kind === "block") continue;
    const rings = clipRings(area.ring, area.holes, model.sideM, frameShape);
    if (!rings) continue;
    if (area.kind === "water") water.push(rings);
    else green.push(rings);
  }
  const rails: PlanPaths["rails"] = [];
  for (const road of model.roads) {
    if (road.kind === "rail") {
      for (const line of clipLines(road.line, model.sideM, frameShape)) rails.push(line);
    }
  }
  const trams: PlanPaths["trams"] = [];
  for (const line of model.tramLines ?? []) {
    for (const part of clipLines(line, model.sideM, frameShape)) trams.push(part);
  }
  return { blocks, green, water, rails, trams, frameShape };
}

export function planPaths(
  model: CityModel,
  pathWidthM = PATH_WIDTH_M,
  contourIndexEvery = 5,
  planScale = 1000,
  coarseIntervalM = DEFAULT_COARSE_INTERVAL_M,
  coarseFromScale = DEFAULT_COARSE_FROM_SCALE,
  planOptions: PlanPathOptions = {},
): PlanPaths {
  const preamble = planPathsPreamble(model);
  const pathFilletM =
    planOptions.pathFilletM !== undefined ? planOptions.pathFilletM : DEFAULT_PATH_FILLET_M;
  const quality = resolvePlanPathQuality(planOptions);
  const footpathStripsInput = footpathStrips(model.roads, pathWidthM);
  const footpaths =
    quality === "smooth"
      ? unionFootpathStripsForPlanSmooth(
          footpathStripsInput,
          model.sideM,
          preamble.frameShape,
          pathFilletM,
          pathWidthM,
          "smooth",
        )
      : unionFootpathStrips(footpathStripsInput, model.sideM, preamble.frameShape, pathFilletM, pathWidthM);
  const carriageway =
    quality === "smooth"
      ? unionRoadSurfaceForPlanSmooth(model.roads, model.tramLines, model.sideM, preamble.frameShape, "smooth")
      : unionRoadSurface(model.roads, model.tramLines, model.sideM, preamble.frameShape);
  return assemblePlanPaths(
    model,
    footpaths,
    carriageway,
    pathWidthM,
    contourIndexEvery,
    planScale,
    coarseIntervalM,
    coarseFromScale,
    planOptions,
    preamble,
  );
}
