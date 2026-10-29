import type { BuildingColourMode } from "./buildingViewportColor";
import { heightReliabilityFill } from "./buildingHeightReliability";
import { getColour } from "./colours";
import { openRing, signedArea } from "./geo";
import { DEFAULT_ISO_CORNER, ISO_CORNERS, type IsoCorner } from "./isoCamera";
import {
  DEFAULT_PATH_FILLET_M,
  footpathStrips,
  isVehicularRoad,
  mergeFootpathFragments,
  subtractFootpathBlockers,
  unionCarriageways,
  unionFootpathStrips,
  unionRoadSurface,
} from "./roadFill";
import { fillRoadMedianGaps } from "./roadMedianFill";
import { carParkWays } from "./planCarParks";
import { isSiteBuilding } from "./siteBuildings";
import {
  circleRing,
  clipAreaToSiteFrame,
  clipPolylineSiteFrame,
  DEFAULT_SITE_FRAME_SHAPE,
  pointInSiteFrame,
  type SiteFrameShape,
} from "./siteFrame";
import { footprintBase, sampleTerrain } from "./terrain";
import {
  altitudeOnInterval,
  DEFAULT_COARSE_FROM_SCALE,
  DEFAULT_COARSE_INTERVAL_M,
  demContourLayer,
  drawContours,
  drawnContourInterval,
} from "./vicmapContours";
import {
  DEFAULT_VIEW3D_DISPLAY,
  isLayer3dVisible,
  type Layer3dId,
  type View3dDisplaySettings,
} from "./view3dDisplay";
import type { CityModel, Pt } from "../types";

export { DEFAULT_ISO_CORNER, ISO_CORNERS, type IsoCorner };

const COS30 = Math.sqrt(3) / 2;
const SIN30 = 0.5;
const round = (v: number) => Math.round(v * 100) / 100;
const TREE_CROWN_SEGMENTS = 14;

/**
 * Corner signs matching `isoCamera.ts` (`CORNER_SIGN`, where `south = -north`):
 * - `sw`: viewer sits SW (-east, -north), looking NE (+east, +north)
 * - `se`: viewer sits SE (+east, -north), looking NW (-east, +north)
 * - `nw`: viewer sits NW (-east, +north), looking SE (+east, -north)
 * - `ne`: viewer sits NE (+east, +north), looking SW (-east, -north)
 */
const CORNER_VECTORS: Record<
  IsoCorner,
  {
    /** Rightward horizontal ground unit vector (rx, ry) in (east, north). */
    rx: number;
    ry: number;
    /** Toward-viewer ground unit vector (vx, vy) in (east, north); larger dot = nearer (lower on screen). */
    vx: number;
    vy: number;
  }
> = {
  sw: { rx: 1, ry: -1, vx: -1, vy: -1 },
  se: { rx: 1, ry: 1, vx: 1, vy: -1 },
  nw: { rx: -1, ry: -1, vx: -1, vy: 1 },
  ne: { rx: -1, ry: 1, vx: 1, vy: 1 },
};

/**
 * Project local `(east, north, upM)` metres into 2D isometric SVG screen coordinates `(x, y)`
 * (where `+x` is right and `+y` is down on screen, and vertical elevation `upM` goes straight up `-upM`).
 * Uses true 30° isometric ground foreshortening (`cos 30° = √3/2`, `sin 30° = 0.5`).
 */
export function projectIsoPoint(
  east: number,
  north: number,
  upM = 0,
  corner: IsoCorner = DEFAULT_ISO_CORNER,
): Pt {
  const c = CORNER_VECTORS[corner];
  const u = (east * c.rx + north * c.ry) * 0.5;
  const v = (east * c.vx + north * c.vy) * 0.5;
  return [u * 2 * COS30, v * 2 * SIN30 - upM];
}

/**
 * Depth along the viewer direction in the ground plane: larger value = closer to the viewer
 * (drawn later in painter's back-to-front order).
 */
export function isoPlanDepth(
  east: number,
  north: number,
  corner: IsoCorner = DEFAULT_ISO_CORNER,
): number {
  const c = CORNER_VECTORS[corner];
  return east * c.vx + north * c.vy;
}

/**
 * Outward normal test for a vertical wall face with plan normal `(nx, ny)`:
 * positive when the wall faces toward the viewer from `corner`.
 */
export function isoWallFacing(
  nx: number,
  ny: number,
  corner: IsoCorner = DEFAULT_ISO_CORNER,
): { visible: boolean; side: "left" | "right" } {
  const c = CORNER_VECTORS[corner];
  const dotViewer = nx * c.vx + ny * c.vy;
  const dotRight = nx * c.rx + ny * c.ry;
  return {
    visible: dotViewer > 1e-9,
    side: dotRight <= 0 ? "left" : "right",
  };
}

export function isoSvgPolylinePoints(points: Pt[], close: boolean): string {
  if (points.length < 2) return "";
  const body = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${round(point[0])} ${round(point[1])}`)
    .join(" ");
  return close ? `${body} Z` : body;
}

function dedupe(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of line) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.05) out.push(point);
  }
  return out;
}

function frameRing(sideM: number, shape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE): Pt[] {
  const half = sideM / 2;
  if (shape === "circle") return circleRing(half, 64);
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
    [-half, -half],
  ];
}

export type IsoPlinthWall = {
  side: "left" | "right";
  d: string;
  fill: string;
  stroke: string;
  topPts: Pt[];
  bottomPts: Pt[];
};

export function groundPlinthThicknessM(model: Pick<CityModel, "sideM">): number {
  return Math.max(6, Math.min(80, round(model.sideM * 0.04)));
}

function buildGroundPlinth(
  model: CityModel,
  corner: IsoCorner,
  colors: IsometricDrawingColors,
  elevationAt: (east: number, north: number) => number,
): {
  slabThicknessM: number;
  baseZ: number;
  frameD: string;
  frameWalls: IsoPlinthWall[];
} {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const half = model.sideM / 2;
  const slabThicknessM = groundPlinthThicknessM(model);
  const baseZ = -slabThicknessM;
  const leftFill = colors.ground;
  const rightFill = colors.ground;
  const stroke = colors.frameEdge;

  if (shape === "circle") {
    const ring = openRing(circleRing(half, 64));
    const topPerimeterPts = ring.map(([e, n]) => projectIsoPoint(e, n, elevationAt(e, n), corner));
    const frameD = isoSvgPolylinePoints(topPerimeterPts, true);
    const segmentsBySide: Record<"left" | "right", { a: Pt; b: Pt }[]> = {
      left: [],
      right: [],
    };
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const nx = b[1] - a[1];
      const ny = -(b[0] - a[0]);
      const facing = isoWallFacing(nx, ny, corner);
      if (!facing.visible) continue;
      segmentsBySide[facing.side].push({ a, b });
    }
    const frameWalls: IsoPlinthWall[] = [];
    for (const side of ["left", "right"] as const) {
      const segs = segmentsBySide[side];
      if (segs.length === 0) continue;
      const orderedPts: Pt[] = [segs[0]!.a];
      for (const seg of segs) orderedPts.push(seg.b);
      const topPts = orderedPts.map(([e, n]) => projectIsoPoint(e, n, elevationAt(e, n), corner));
      const bottomPts = [...orderedPts]
        .reverse()
        .map(([e, n]) => projectIsoPoint(e, n, baseZ, corner));
      const d = isoSvgPolylinePoints([...topPts, ...bottomPts], true);
      if (d) {
        frameWalls.push({
          side,
          d,
          fill: side === "left" ? leftFill : rightFill,
          stroke,
          topPts,
          bottomPts,
        });
      }
    }
    return { slabThicknessM, baseZ, frameD, frameWalls };
  }

  const squareEdges: { a: Pt; b: Pt; nx: number; ny: number }[] = [
    { a: [-half, -half], b: [half, -half], nx: 0, ny: -1 },
    { a: [half, -half], b: [half, half], nx: 1, ny: 0 },
    { a: [half, half], b: [-half, half], nx: 0, ny: 1 },
    { a: [-half, half], b: [-half, -half], nx: -1, ny: 0 },
  ];
  const edgeSteps = model.terrain
    ? Math.max(16, Math.min(48, Math.ceil(model.sideM / Math.max(4, model.terrain.spacingM))))
    : 1;

  const topPerimeterPts: Pt[] = [];
  for (const { a, b } of squareEdges) {
    for (let k = 0; k < edgeSteps; k += 1) {
      const t = k / edgeSteps;
      const e = a[0] + (b[0] - a[0]) * t;
      const n = a[1] + (b[1] - a[1]) * t;
      topPerimeterPts.push(projectIsoPoint(e, n, elevationAt(e, n), corner));
    }
  }
  const frameD = isoSvgPolylinePoints(topPerimeterPts, true);

  const frameWalls: IsoPlinthWall[] = [];
  for (const { a, b, nx, ny } of squareEdges) {
    const facing = isoWallFacing(nx, ny, corner);
    if (!facing.visible) continue;
    const topPts: Pt[] = [];
    for (let k = 0; k <= edgeSteps; k += 1) {
      const t = k / edgeSteps;
      const e = a[0] + (b[0] - a[0]) * t;
      const n = a[1] + (b[1] - a[1]) * t;
      topPts.push(projectIsoPoint(e, n, elevationAt(e, n), corner));
    }
    const bottomPts: Pt[] = [
      projectIsoPoint(b[0], b[1], baseZ, corner),
      projectIsoPoint(a[0], a[1], baseZ, corner),
    ];
    const d = isoSvgPolylinePoints([...topPts, ...bottomPts], true);
    if (d) {
      frameWalls.push({
        side: facing.side,
        d,
        fill: facing.side === "left" ? leftFill : rightFill,
        stroke,
        topPts,
        bottomPts,
      });
    }
  }

  frameWalls.sort((u, v) => (u.side === v.side ? 0 : u.side === "left" ? -1 : 1));
  return { slabThicknessM, baseZ, frameD, frameWalls };
}

export type IsoSolidItem =
  | {
      kind: "building";
      id: number;
      depth: number;
      topM: number;
      walls: { d: string; fill: string; stroke: string }[];
      roofD: string;
      roofFill: string;
      stroke: string;
      imported?: boolean;
      site?: boolean;
    }
  | {
      kind: "tree";
      id: number;
      depth: number;
      topM: number;
      trunkD: string | null;
      trunkFill: string;
      canopyD: string;
      canopyFill: string;
      shadeD: string;
      shadeFill: string;
      stroke: string;
    };

export type IsometricDrawingColors = {
  ground: string;
  frameEdge: string;
  buildings: string;
  buildingEdge: string;
  siteBuilding: string;
  importedMassing: string;
  roads: string;
  roadEdge: string;
  footpaths: string;
  footpathEdge: string;
  trees: string;
  treeTrunk: string;
  landscape: string;
  water: string;
  rail: string;
  tram: string;
  contours: string;
};

export function readIsometricDrawingColors(): IsometricDrawingColors {
  return {
    ground: getColour("--ground-fill"),
    frameEdge: getColour("--ground-edge"),
    buildings: getColour("--building-uniform"),
    buildingEdge: getColour("--outline-building"),
    siteBuilding: getColour("--site-building"),
    importedMassing: getColour("--imported-massing"),
    roads: getColour("--road-local"),
    roadEdge: getColour("--outline-road"),
    footpaths: getColour("--road-path"),
    footpathEdge: getColour("--outline-path"),
    trees: getColour("--tree-crown"),
    treeTrunk: getColour("--tree-trunk"),
    landscape: getColour("--green-3d"),
    water: getColour("--water-3d"),
    rail: getColour("--rail-fill"),
    tram: getColour("--tram-line-stroke"),
    contours: getColour("--outline-contour"),
  };
}

export type IsometricDrawingGeometry = {
  corner: IsoCorner;
  colors: IsometricDrawingColors;
  layersVisible: Record<Layer3dId, boolean>;
  slabThicknessM: number;
  frameD: string;
  frameWalls: IsoPlinthWall[];
  plinthWalls: IsoPlinthWall[];
  landscapePaths: string[];
  waterPaths: string[];
  footpathPaths: string[];
  roadPaths: string[];
  roadCenterlines: string[];
  railLines: string[];
  tramLines: string[];
  contourLines: { d: string; index: boolean }[];
  solids: IsoSolidItem[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

function circlePath(
  cx: number,
  cy: number,
  r: number,
  from = 0,
  to = Math.PI * 2,
  closeVia?: Pt[],
): string {
  const pts: Pt[] = [];
  const n = Math.max(3, Math.round((TREE_CROWN_SEGMENTS * (to - from)) / (Math.PI * 2)));
  for (let i = 0; i <= n; i += 1) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  if (closeVia) pts.push(...closeVia);
  return `${pts.map((p, i) => `${i === 0 ? "M" : "L"}${round(p[0])} ${round(p[1])}`).join(" ")} Z`;
}

function projectRingsToPath(
  rings: Pt[][],
  corner: IsoCorner,
  elevationAt: (east: number, north: number) => number,
): string {
  return rings
    .map((ring) => {
      const pts = openRing(ring).map(([e, n]) => projectIsoPoint(e, n, elevationAt(e, n), corner));
      return isoSvgPolylinePoints(pts, true);
    })
    .filter(Boolean)
    .join(" ");
}

function buildBuildingSolids(
  model: CityModel,
  corner: IsoCorner,
  colors: IsometricDrawingColors,
  baseElevation: number,
  buildingColour?: BuildingColourMode,
): IsoSolidItem[] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const items: IsoSolidItem[] = [];

  for (const building of model.buildings) {
    if (building.meshDrawnBy != null) continue;
    const terrainBase = model.terrain
      ? footprintBase(model.terrain, building.ring, model.sideM) - baseElevation
      : 0;
    const parts = building.extrusionParts?.length
      ? building.extrusionParts.map((p) => ({
          ring: p.ring,
          holes: p.holes,
          height: p.height,
          base: terrainBase + (p.base ?? 0),
        }))
      : [
          {
            ring: building.ring,
            holes: building.holes,
            height: building.height,
            base: terrainBase,
          },
        ];

    const onSite = isSiteBuilding(model, building.id);
    const roofBaseColor = building.importedMassing
      ? (building.importedColour ?? colors.importedMassing)
      : onSite
        ? colors.siteBuilding
        : buildingColour?.colourByHeightReliability
          ? heightReliabilityFill(building)
          : colors.buildings;
    const wallLight = roofBaseColor;
    const wallDark = roofBaseColor;
    const stroke = colors.buildingEdge;

    for (const part of parts) {
      if (!(part.height > part.base - terrainBase)) continue;
      const top = terrainBase + part.height;
      const base = part.base;
      if (!(top > base)) continue;

      const clipped = clipAreaToSiteFrame(part.ring as Pt[], part.holes as Pt[][], model.sideM, shape);
      if (!clipped || clipped.length === 0) continue;
      const outer = openRing(clipped[0]!);
      if (outer.length < 3) continue;
      const holes = clipped.slice(1).map((h) => openRing(h)).filter((h) => h.length >= 3);
      const rings = [outer, ...holes];

      let sumDepth = 0;
      let maxDepth = -Infinity;
      for (const [e, n] of outer) {
        const d = isoPlanDepth(e, n, corner);
        sumDepth += d;
        if (d > maxDepth) maxDepth = d;
      }
      const meanDepth = sumDepth / outer.length;
      const sortDepth = meanDepth * 0.65 + maxDepth * 0.35;

      const wallsWithDepth: { d: string; fill: string; stroke: string; depth: number }[] = [];
      rings.forEach((ring, ringIndex) => {
        const ccw = (signedArea(ring) > 0) === (ringIndex === 0);
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const nx = ccw ? dy : -dy;
          const ny = ccw ? -dx : dx;
          const facing = isoWallFacing(nx, ny, corner);
          if (!facing.visible) continue;
          const wallPts: Pt[] = [
            projectIsoPoint(a[0], a[1], base, corner),
            projectIsoPoint(b[0], b[1], base, corner),
            projectIsoPoint(b[0], b[1], top, corner),
            projectIsoPoint(a[0], a[1], top, corner),
          ];
          wallsWithDepth.push({
            d: isoSvgPolylinePoints(wallPts, true),
            fill: facing.side === "left" ? wallLight : wallDark,
            stroke,
            depth: isoPlanDepth((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, corner),
          });
        }
      });

      wallsWithDepth.sort((p, q) => p.depth - q.depth);
      const roofD = rings
        .map((ring) => isoSvgPolylinePoints(ring.map(([e, n]) => projectIsoPoint(e, n, top, corner)), true))
        .filter(Boolean)
        .join(" ");

      items.push({
        kind: "building",
        id: building.id,
        depth: sortDepth,
        topM: top,
        walls: wallsWithDepth.map(({ d, fill, stroke: s }) => ({ d, fill, stroke: s })),
        roofD,
        roofFill: roofBaseColor,
        stroke,
        imported: building.importedMassing,
        site: onSite,
      });
    }
  }

  return items;
}

function buildTreeSolids(
  model: CityModel,
  corner: IsoCorner,
  colors: IsometricDrawingColors,
  elevationAt: (east: number, north: number) => number,
): IsoSolidItem[] {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const canopyFill = colors.trees;
  const stroke = colors.buildingEdge;
  const items: IsoSolidItem[] = [];

  for (const tree of model.trees) {
    if (!pointInSiteFrame(tree.at, model.sideM, shape)) continue;
    const [east, north] = tree.at;
    const groundZ = elevationAt(east, north);
    const r = Math.max(0.6, tree.crown_diameter_m / 2);
    const height = Math.max(r * 2, tree.height_m || r * 2);
    const centreUp = groundZ + height - r;
    const [bx, by] = projectIsoPoint(east, north, groundZ, corner);
    const [cx, cy] = projectIsoPoint(east, north, centreUp, corner);
    const trunkD =
      centreUp - groundZ > r * 0.2
        ? `M${round(bx)} ${round(by)} L${round(cx)} ${round(cy)}`
        : null;
    const canopyD = circlePath(cx, cy, r);
    items.push({
      kind: "tree",
      id: tree.id,
      depth: isoPlanDepth(east, north, corner),
      topM: groundZ + height,
      trunkD,
      trunkFill: colors.treeTrunk,
      canopyD,
      canopyFill,
      shadeD: "",
      shadeFill: canopyFill,
      stroke,
    });
  }

  return items;
}

export function buildIsometricDrawing(
  model: CityModel,
  options?: {
    corner?: IsoCorner;
    display?: View3dDisplaySettings;
    colors?: IsometricDrawingColors;
    planScale?: number;
    buildingColour?: BuildingColourMode;
  },
): IsometricDrawingGeometry {
  const corner = options?.corner ?? DEFAULT_ISO_CORNER;
  const display = options?.display ?? DEFAULT_VIEW3D_DISPLAY;
  const colors = options?.colors ?? readIsometricDrawingColors();
  const planScale = options?.planScale ?? 1000;
  const buildingColour =
    options?.buildingColour ??
    (display.heightReliabilityView
      ? { colourByUse: false, uniformBuildings: false, colourBySource: false, colourByHeightReliability: true }
      : undefined);
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;

  const layersVisible: Record<Layer3dId, boolean> = {
    buildings: isLayer3dVisible(display, "buildings"),
    roads: isLayer3dVisible(display, "roads"),
    footpaths: isLayer3dVisible(display, "footpaths"),
    trees: isLayer3dVisible(display, "trees"),
    landscape: isLayer3dVisible(display, "landscape"),
    water: isLayer3dVisible(display, "water"),
    rail: isLayer3dVisible(display, "rail"),
    contours: isLayer3dVisible(display, "contours"),
  };

  const baseElevation = model.terrain ? model.terrain.min : 0;
  const elevationAt = (east: number, north: number): number =>
    model.terrain ? sampleTerrain(model.terrain, east, north, model.sideM) - baseElevation : 0;

  const { slabThicknessM, frameD, frameWalls } = buildGroundPlinth(
    model,
    corner,
    colors,
    elevationAt,
  );

  const landscapePaths: string[] = [];
  const waterPaths: string[] = [];
  for (const area of model.areas) {
    if (area.kind === "block") continue;
    if (area.kind === "water" && !layersVisible.water) continue;
    if (area.kind === "green" && !layersVisible.landscape) continue;
    const clipped = clipAreaToSiteFrame(area.ring, area.holes, model.sideM, shape);
    if (!clipped) continue;
    const d = projectRingsToPath(clipped, corner, elevationAt);
    if (!d) continue;
    if (area.kind === "water") waterPaths.push(d);
    else landscapePaths.push(d);
  }

  const footpathPaths: string[] = [];
  const roadPaths: string[] = [];
  const roadCenterlines: string[] = [];

  if (layersVisible.roads || layersVisible.footpaths) {
    const carPark = carParkWays(model.roads, model.carParks);
    const planRoads = carPark.size > 0 ? model.roads.filter((road) => !carPark.has(road)) : model.roads;
    const carriageway = unionRoadSurface(planRoads, model.tramLines, model.sideM, shape);

    if (layersVisible.footpaths) {
      const footpaths = unionFootpathStrips(
        footpathStrips(model.roads, 2.5),
        model.sideM,
        shape,
        DEFAULT_PATH_FILLET_M,
      );
      let pathMulti = footpaths.polygons;
      if (carriageway.polygons.length > 0) {
        pathMulti = subtractFootpathBlockers(pathMulti, carriageway.polygons);
        pathMulti = mergeFootpathFragments(pathMulti);
      }
      for (const poly of pathMulti) {
        const rings = poly.map((r) => r.map((p): Pt => [p[0], p[1]]));
        const d = projectRingsToPath(rings, corner, elevationAt);
        if (d) footpathPaths.push(d);
      }
      for (const road of model.roads) {
        if (road.kind !== "road" || road.grade !== "path") continue;
        for (const part of clipPolylineSiteFrame(dedupe(road.line), model.sideM, shape)) {
          if (part.length < 2) continue;
          const d = isoSvgPolylinePoints(
            part.map(([e, n]) => projectIsoPoint(e, n, elevationAt(e, n), corner)),
            false,
          );
          if (d) footpathPaths.push(d);
        }
      }
    }

    if (layersVisible.roads) {
      const streets = model.roads
        .filter((road) => road.kind === "road" && road.grade !== "path" && !road.service)
        .map((road) => ({ line: road.line, width: road.width }));
      const roadMulti = fillRoadMedianGaps(
        carriageway.polygons,
        { green: [], water: [], buildings: [] },
        undefined,
        streets,
      );
      for (const poly of roadMulti) {
        const rings = poly.map((r) => r.map((p): Pt => [p[0], p[1]]));
        const d = projectRingsToPath(rings, corner, elevationAt);
        if (d) roadPaths.push(d);
      }
      if (roadPaths.length === 0) {
        const fallbackCarriageways = unionCarriageways(
          model.roads
            .filter((r) => isVehicularRoad(r))
            .map((r) => ({ line: r.line, width: r.width })),
          model.sideM,
          shape,
        );
        for (const poly of fallbackCarriageways.polygons) {
          const rings = poly.map((r) => r.map((p): Pt => [p[0], p[1]]));
          const d = projectRingsToPath(rings, corner, elevationAt);
          if (d) roadPaths.push(d);
        }
      }
      for (const road of model.roads) {
        if (!isVehicularRoad(road)) continue;
        for (const part of clipPolylineSiteFrame(dedupe(road.line), model.sideM, shape)) {
          if (part.length < 2) continue;
          const d = isoSvgPolylinePoints(
            part.map(([e, n]) => projectIsoPoint(e, n, elevationAt(e, n), corner)),
            false,
          );
          if (d) roadCenterlines.push(d);
        }
      }
    }
  }

  const railLines: string[] = [];
  const tramLines: string[] = [];
  if (layersVisible.rail) {
    for (const road of model.roads) {
      if (road.kind !== "rail") continue;
      for (const part of clipPolylineSiteFrame(dedupe(road.line), model.sideM, shape)) {
        if (part.length < 2) continue;
        const d = isoSvgPolylinePoints(
          part.map(([e, n]) => projectIsoPoint(e, n, elevationAt(e, n), corner)),
          false,
        );
        if (d) railLines.push(d);
      }
    }
    for (const line of model.tramLines ?? []) {
      for (const part of clipPolylineSiteFrame(dedupe(line), model.sideM, shape)) {
        if (part.length < 2) continue;
        const d = isoSvgPolylinePoints(
          part.map(([e, n]) => projectIsoPoint(e, n, elevationAt(e, n), corner)),
          false,
        );
        if (d) tramLines.push(d);
      }
    }
  }

  const contourLines: { d: string; index: boolean }[] = [];
  if (layersVisible.contours && model.contours !== false) {
    const layer = model.contourLayer
      ? model.contourLayer
      : model.contours && model.terrain
        ? demContourLayer(model.terrain, model.sideM)
        : null;
    if (layer) {
      const minZ = layer.lines.reduce((m, l) => Math.min(m, l.z), model.terrain?.min ?? Infinity);
      const contourBaseZ = Number.isFinite(minZ) ? minZ : baseElevation;
      const clipped = layer.lines.flatMap((line) =>
        clipPolylineSiteFrame(dedupe(line.points), model.sideM, shape)
          .map(dedupe)
          .filter((pts) => pts.length >= 2)
          .map((points) => ({ points, z: line.z })),
      );
      const drawnInterval = drawnContourInterval(
        layer.source,
        layer.interval,
        planScale,
        DEFAULT_COARSE_INTERVAL_M,
        DEFAULT_COARSE_FROM_SCALE,
      );
      const visible =
        drawnInterval > layer.interval
          ? clipped.filter((line) => altitudeOnInterval(line.z, drawnInterval))
          : clipped;
      const drawn = visible.length > 0 ? drawContours(visible, drawnInterval, 5) : null;
      if (drawn) {
        drawn.lines.forEach((line, idx) => {
          const zRel = Math.max(0, (visible[idx]?.z ?? contourBaseZ) - contourBaseZ);
          const pts = line.points.map(([e, n]) => projectIsoPoint(e, n, zRel, corner));
          const d = isoSvgPolylinePoints(pts, false);
          if (d) contourLines.push({ d, index: line.index });
        });
      }
    }
  }

  const solids: IsoSolidItem[] = [];
  if (layersVisible.buildings) {
    solids.push(...buildBuildingSolids(model, corner, colors, baseElevation, buildingColour));
  }
  if (layersVisible.trees) {
    solids.push(...buildTreeSolids(model, corner, colors, elevationAt));
  }
  solids.sort((a, b) => a.depth - b.depth || a.topM - b.topM);

  const bounds = isometricDrawingBounds(model, corner);

  return {
    corner,
    colors,
    layersVisible,
    slabThicknessM,
    frameD,
    frameWalls,
    plinthWalls: frameWalls,
    landscapePaths,
    waterPaths,
    footpathPaths,
    roadPaths,
    roadCenterlines,
    railLines,
    tramLines,
    contourLines,
    solids,
    bounds,
  };
}

export function isometricDrawingBounds(
  model: CityModel,
  corner: IsoCorner = DEFAULT_ISO_CORNER,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const ring = frameRing(model.sideM, shape);
  let maxBuildingH = 20;
  for (const b of model.buildings) {
    if (b.height > maxBuildingH) maxBuildingH = b.height;
  }
  const relief = model.terrain ? Math.max(0, model.terrain.max - model.terrain.min) : 0;
  const maxUp = maxBuildingH + relief;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const bump = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  const baseZ = -groundPlinthThicknessM(model);
  for (const [e, n] of ring) {
    const [xBase, yBase] = projectIsoPoint(e, n, baseZ, corner);
    const [x0, y0] = projectIsoPoint(e, n, 0, corner);
    const [x1, y1] = projectIsoPoint(e, n, maxUp, corner);
    bump(xBase, yBase);
    bump(x0, y0);
    bump(x1, y1);
  }

  const padX = model.sideM * 0.1;
  const padY = model.sideM * 0.1;
  return {
    minX: minX - padX,
    minY: minY - padY,
    maxX: maxX + padX,
    maxY: maxY + padY,
  };
}
