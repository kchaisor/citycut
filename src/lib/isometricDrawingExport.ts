import { buildLayeredPdf, type PdfChunk, type PdfPath } from "./aiDocument";
import { getColour } from "./colours";
import { dashPair, dashScreen, readDrawingStyle } from "./drawingStyle";
import { stableExportModel } from "./exportStableOrder";
import { layoutSheet, paperMillimetres, type SheetLayout } from "./figureGround";
import {
  buildIsometricDrawing,
  DEFAULT_ISO_CORNER,
  readIsometricDrawingColors,
  type IsoCorner,
  type IsometricDrawingColors,
} from "./isometricDrawing";
import { hexRgb } from "./lineweights";
import { HEIGHT_RELIABILITY_EXPORT_LAYER, heightReliabilityClass } from "./buildingHeightReliability";
import { DEFAULT_VIEW3D_DISPLAY, type View3dDisplaySettings } from "./view3dDisplay";
import type { CityModel } from "../types";

export const ISOMETRIC_EXPORT_LAYERS = [
  "Frame",
  "Landscape",
  "Water",
  "Footpaths",
  "Contours",
  "Roads",
  "Rail & tram",
  "Buildings & trees",
  "Annotation",
] as const;

export type IsometricExportOptions = {
  corner?: IsoCorner;
  display?: View3dDisplaySettings;
  colors?: IsometricDrawingColors;
};

type IsoSheetFrame = {
  toPage: (isoX: number, isoY: number) => [number, number];
  scale: number;
};

function isoSheetFrame(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  layout: SheetLayout,
  scale: number,
): IsoSheetFrame {
  const page = layout.pageHeightMm;
  const cx = layout.frameX + layout.frameMm / 2;
  const cy = page - (layout.frameY + layout.frameMm / 2);
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const spanXMm = Math.max(1, paperMillimetres(bounds.maxX - bounds.minX, scale));
  const spanYMm = Math.max(1, paperMillimetres(bounds.maxY - bounds.minY, scale));
  const fit = Math.min(1, (layout.frameMm * 0.94) / Math.max(spanXMm, spanYMm));
  return {
    scale,
    toPage: (isoX, isoY) => [
      cx + paperMillimetres(isoX - midX, scale) * fit,
      cy - paperMillimetres(isoY - midY, scale) * fit,
    ],
  };
}

function parseSvgSubpaths(d: string): { rings: [number, number][][]; closed: boolean } {
  const trimmed = d.trim();
  if (!trimmed) return { rings: [], closed: false };
  const closed = /Z\s*$/i.test(trimmed);
  const rawParts = trimmed
    .split(/(?=\bM)/)
    .map((part) => part.trim())
    .filter(Boolean);
  const rings: [number, number][][] = [];
  for (const part of rawParts) {
    const tokens = part.match(/[ML][\d.-]+ [\d.-]+/g) ?? [];
    const pts: [number, number][] = [];
    for (const token of tokens) {
      const m = /^[ML]([\d.-]+) ([\d.-]+)/.exec(token);
      if (m) pts.push([Number(m[1]), Number(m[2])]);
    }
    if (pts.length >= 2) rings.push(pts);
  }
  return { rings, closed };
}

function subpathsToPdfRings(d: string, frame: IsoSheetFrame): { rings: number[][][]; closed: boolean } {
  const parsed = parseSvgSubpaths(d);
  return {
    rings: parsed.rings
      .filter((r) => r.length >= 2)
      .map((ring) => ring.map(([x, y]) => frame.toPage(x, y))),
    closed: parsed.closed,
  };
}

export function isometricDrawingChunks(
  model: CityModel,
  scale: number,
  options?: IsometricExportOptions,
): { layout: SheetLayout; chunks: PdfChunk[]; layerOrder: string[] } {
  model = stableExportModel(model);
  const corner = options?.corner ?? DEFAULT_ISO_CORNER;
  const display = options?.display ?? DEFAULT_VIEW3D_DISPLAY;
  const colors = options?.colors ?? readIsometricDrawingColors();
  const lineStyle = readDrawingStyle();
  const layout = layoutSheet(model.sideM, scale);
  const iso = buildIsometricDrawing(model, {
    corner,
    display,
    colors,
    planScale: scale,
  });
  const frame = isoSheetFrame(iso.bounds, layout, scale);
  const chunks: PdfChunk[] = [];

  // 1. Frame (ground top surface + architectural plinth side walls + outline)
  const framePaths: PdfPath[] = [];
  const frameParsed = subpathsToPdfRings(iso.frameD, frame);
  if (frameParsed.rings.length > 0) {
    framePaths.push({
      rings: frameParsed.rings,
      fill: hexRgb(colors.ground),
      stroke: hexRgb(colors.frameEdge),
      strokeMm: 0.28,
      close: true,
      evenOdd: false,
      join: "round",
    });
  }
  for (const wall of iso.frameWalls) {
    const wallParsed = subpathsToPdfRings(wall.d, frame);
    if (wallParsed.rings.length === 0) continue;
    framePaths.push({
      rings: wallParsed.rings,
      fill: hexRgb(wall.fill),
      stroke: hexRgb(wall.stroke),
      strokeMm: 0.28,
      close: true,
      evenOdd: false,
      join: "round",
    });
  }
  if (framePaths.length > 0) {
    chunks.push({
      name: "Frame",
      paths: framePaths,
    });
  }

  // 2. Landscape
  if (iso.landscapePaths.length > 0) {
    const paths: PdfPath[] = [];
    for (const d of iso.landscapePaths) {
      const parsed = subpathsToPdfRings(d, frame);
      if (parsed.rings.length === 0) continue;
      paths.push({
        rings: parsed.rings,
        fill: hexRgb(colors.landscape),
        stroke: hexRgb(colors.frameEdge),
        strokeMm: 0.08,
        close: true,
        evenOdd: true,
        join: "round",
      });
    }
    if (paths.length > 0) chunks.push({ name: "Landscape", paths });
  }

  // 3. Water
  if (iso.waterPaths.length > 0) {
    const paths: PdfPath[] = [];
    for (const d of iso.waterPaths) {
      const parsed = subpathsToPdfRings(d, frame);
      if (parsed.rings.length === 0) continue;
      paths.push({
        rings: parsed.rings,
        fill: hexRgb(colors.water),
        stroke: hexRgb(colors.frameEdge),
        strokeMm: 0.1,
        close: true,
        evenOdd: true,
        join: "round",
      });
    }
    if (paths.length > 0) chunks.push({ name: "Water", paths });
  }

  // 4. Footpaths
  if (iso.footpathPaths.length > 0) {
    const paths: PdfPath[] = [];
    for (const d of iso.footpathPaths) {
      const parsed = subpathsToPdfRings(d, frame);
      if (parsed.rings.length === 0) continue;
      if (parsed.closed) {
        paths.push({
          rings: parsed.rings,
          fill: hexRgb(colors.footpaths),
          stroke: hexRgb(colors.footpathEdge),
          strokeMm: 0.08,
          close: true,
          evenOdd: true,
          join: "round",
        });
      } else {
        paths.push({
          rings: parsed.rings,
          stroke: hexRgb(colors.footpaths),
          strokeMm: 0.22,
          close: false,
          cap: "round",
          join: "round",
        });
      }
    }
    if (paths.length > 0) chunks.push({ name: "Footpaths", paths });
  }

  // 5. Contours
  if (iso.contourLines.length > 0) {
    const dashMm = dashPair(lineStyle.contour.dash);
    const paths: PdfPath[] = [];
    for (const line of iso.contourLines) {
      const parsed = subpathsToPdfRings(line.d, frame);
      if (parsed.rings.length === 0) continue;
      paths.push({
        rings: parsed.rings,
        stroke: hexRgb(colors.contours),
        strokeMm: line.index ? 0.24 : 0.14,
        ...(dashMm ? { dashMm } : {}),
        close: false,
        cap: "round",
        join: "round",
      });
    }
    if (paths.length > 0) chunks.push({ name: "Contours", paths });
  }

  // 6. Roads
  if (iso.roadPaths.length > 0 || iso.roadCenterlines.length > 0) {
    const paths: PdfPath[] = [];
    for (const d of iso.roadPaths) {
      const parsed = subpathsToPdfRings(d, frame);
      if (parsed.rings.length === 0) continue;
      paths.push({
        rings: parsed.rings,
        fill: hexRgb(colors.roads),
        stroke: hexRgb(colors.roadEdge),
        strokeMm: 0.1,
        close: true,
        evenOdd: true,
        join: "round",
      });
    }
    if (paths.length === 0) {
      for (const d of iso.roadCenterlines) {
        const parsed = subpathsToPdfRings(d, frame);
        if (parsed.rings.length === 0) continue;
        paths.push({
          rings: parsed.rings,
          stroke: hexRgb(colors.roads),
          strokeMm: 0.35,
          close: false,
          cap: "round",
          join: "round",
        });
      }
    }
    if (paths.length > 0) chunks.push({ name: "Roads", paths });
  }

  // 7. Rail & tram
  if (iso.railLines.length > 0 || iso.tramLines.length > 0) {
    const paths: PdfPath[] = [];
    const rawDash = dashPair(lineStyle.tram.dash);
    const tramDash: [number, number] = rawDash ? [rawDash[0], rawDash[1]] : [1.2, 0.9];
    for (const d of iso.railLines) {
      const parsed = subpathsToPdfRings(d, frame);
      if (parsed.rings.length === 0) continue;
      paths.push({
        rings: parsed.rings,
        stroke: hexRgb(colors.rail),
        strokeMm: 0.28,
        close: false,
        cap: "round",
        join: "round",
      });
    }
    for (const d of iso.tramLines) {
      const parsed = subpathsToPdfRings(d, frame);
      if (parsed.rings.length === 0) continue;
      paths.push({
        rings: parsed.rings,
        stroke: hexRgb(colors.tram),
        strokeMm: 0.24,
        dashMm: tramDash,
        close: false,
        cap: "round",
        join: "round",
      });
    }
    if (paths.length > 0) chunks.push({ name: "Rail & tram", paths });
  }

  const splitHeightReliability = Boolean(display.heightReliabilityView);
  const buildingLayerPaths = new Map<string, PdfPath[]>();
  const treePaths: PdfPath[] = [];
  const combinedPaths: PdfPath[] = [];

  function pushBuildingPaths(target: PdfPath[], solid: Extract<(typeof iso.solids)[number], { kind: "building" }>) {
    for (const wall of solid.walls) {
      const parsed = subpathsToPdfRings(wall.d, frame);
      if (parsed.rings.length === 0) continue;
      target.push({
        rings: parsed.rings,
        fill: hexRgb(wall.fill),
        stroke: hexRgb(wall.stroke),
        strokeMm: 0.12,
        close: true,
        evenOdd: false,
        join: "round",
      });
    }
    const roofParsed = subpathsToPdfRings(solid.roofD, frame);
    if (roofParsed.rings.length > 0) {
      target.push({
        rings: roofParsed.rings,
        fill: hexRgb(solid.roofFill),
        stroke: hexRgb(solid.stroke),
        strokeMm: 0.16,
        close: true,
        evenOdd: true,
        join: "round",
      });
    }
  }

  // 8. Buildings & trees (depth-sorted painter's order so foreground occludes background)
  if (iso.solids.length > 0) {
    for (const solid of iso.solids) {
      if (solid.kind === "building") {
        if (splitHeightReliability) {
          const building = model.buildings.find((item) => item.id === solid.id);
          const layerName = building
            ? HEIGHT_RELIABILITY_EXPORT_LAYER[heightReliabilityClass(building)]
            : HEIGHT_RELIABILITY_EXPORT_LAYER.estimated;
          const layerPaths = buildingLayerPaths.get(layerName) ?? [];
          pushBuildingPaths(layerPaths, solid);
          buildingLayerPaths.set(layerName, layerPaths);
        } else {
          pushBuildingPaths(combinedPaths, solid);
        }
      } else {
        const target = splitHeightReliability ? treePaths : combinedPaths;
        if (solid.trunkD) {
          const trunkParsed = subpathsToPdfRings(solid.trunkD, frame);
          if (trunkParsed.rings.length > 0) {
            target.push({
              rings: trunkParsed.rings,
              stroke: hexRgb(solid.trunkFill),
              strokeMm: 0.14,
              close: false,
              cap: "round",
            });
          }
        }
        const canopyParsed = subpathsToPdfRings(solid.canopyD, frame);
        if (canopyParsed.rings.length > 0) {
          target.push({
            rings: canopyParsed.rings,
            fill: hexRgb(solid.canopyFill),
            stroke: hexRgb(solid.stroke),
            strokeMm: 0.12,
            close: true,
            evenOdd: false,
            join: "round",
          });
        }
      }
    }
    if (splitHeightReliability) {
      for (const layerName of Object.values(HEIGHT_RELIABILITY_EXPORT_LAYER)) {
        const layerPaths = buildingLayerPaths.get(layerName);
        if (layerPaths && layerPaths.length > 0) chunks.push({ name: layerName, paths: layerPaths });
      }
      if (treePaths.length > 0) chunks.push({ name: "Trees", paths: treePaths });
    } else if (combinedPaths.length > 0) {
      chunks.push({ name: "Buildings & trees", paths: combinedPaths });
    }
  }

  // 9. Annotation
  const ink = hexRgb(getColour("--axo-label"));
  const page = layout.pageHeightMm;
  chunks.push({
    name: "Annotation",
    texts: [
      {
        x: layout.edgeMm,
        y: page - layout.titleY,
        sizeMm: 2.6,
        text: `${model.placeLabel} — Isometric (${corner.toUpperCase()}) · 1:${scale}`,
        color: ink,
      },
      {
        x: layout.edgeMm,
        y: page - layout.creditY,
        sizeMm: 2.1,
        text: `CityCut isometric 3D vector drawing (${corner.toUpperCase()} view). Map data © OpenStreetMap contributors (ODbL).`,
        color: ink,
      },
    ],
  });

  return {
    layout,
    chunks,
    layerOrder: [...ISOMETRIC_EXPORT_LAYERS],
  };
}

export async function isometricDrawingPdf(
  model: CityModel,
  scale: number,
  options?: IsometricExportOptions,
): Promise<Uint8Array> {
  const { layout, chunks, layerOrder } = isometricDrawingChunks(model, scale, options);
  return buildLayeredPdf(layout.pageWidthMm, layout.pageHeightMm, chunks, layerOrder);
}

export async function isometricDrawingSvg(
  model: CityModel,
  scale: number,
  options?: IsometricExportOptions,
): Promise<string> {
  const { buildLayeredSvg } = await import("./svgDocument");
  const { layout, chunks, layerOrder } = isometricDrawingChunks(model, scale, options);
  return buildLayeredSvg(layout.pageWidthMm, layout.pageHeightMm, chunks, layerOrder);
}

export {
  dashScreen,
  isometricDrawingPdf as isometricAi,
  isometricDrawingSvg as isometricSvg,
};
