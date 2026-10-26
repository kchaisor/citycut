import { regionCredit } from "./sources/registry";
import type { PdfChunk, PdfPath, PdfText } from "./aiDocument";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import { formatCoord } from "./geo";
import { plainDataCredit } from "./dataCredits";
import { comTreesCreditLine } from "./comTreesCredit";
import { dashSegments, readDrawingStyle } from "./drawingStyle";
import {
  axoPlateColours,
  axoPlateLabelText,
  axoLayerBasePaint,
  axoLayerLabelAnchor,
  axoLayersForPaint,
  axoPaintColour,
  buildExplodedAxoLayers,
  explodedAxoBounds,
  type AxoLayerId,
  type AxoPaintKey,
  type ExplodedAxoOverlayBundle,
  type ExplodedAxoSettings,
} from "./explodedAxo";
import { stableExportModel } from "./exportStableOrder";
import type { CityModel, Pt } from "../types";

/** Millimetres on the sheet per metre in iso space at plan scale 1:scale. */
function mmPerMetre(scale: number): number {
  return 1000 / scale;
}

function isoToSheet(point: Pt, origin: Pt, scale: number, pageHeightMm: number): [number, number] {
  const k = mmPerMetre(scale);
  const x = (point[0] - origin[0]) * k;
  const yDown = (point[1] - origin[1]) * k;
  return [x, pageHeightMm - yDown];
}

/** Base iso geometry → sheet coords at `liftM` (matches `axoLayerSvgTransform`). */
function isoBaseToSheet(
  east: number,
  north: number,
  liftM: number,
  origin: Pt,
  scale: number,
  pageHeightMm: number,
): [number, number] {
  return isoToSheet([east, north - liftM], origin, scale, pageHeightMm);
}

function pathFromIsoD(
  d: string,
  origin: Pt,
  scale: number,
  pageHeightMm: number,
  liftM = 0,
): number[][] {
  const ring: number[][] = [];
  const tokens = d.match(/[ML][\d.-]+ [\d.-]+/g) ?? [];
  for (const token of tokens) {
    const m = /^[ML]([\d.-]+) ([\d.-]+)/.exec(token);
    if (m) {
      ring.push(isoBaseToSheet(Number(m[1]), Number(m[2]), liftM, origin, scale, pageHeightMm));
    }
  }
  return ring;
}

function ringsFromIsoD(
  d: string,
  origin: Pt,
  scale: number,
  pageHeightMm: number,
  liftM = 0,
): number[][][] {
  const parts = d
    .split(/(?<=\sZ)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const rings: number[][][] = [];
  for (const part of parts) {
    const ring = pathFromIsoD(part, origin, scale, pageHeightMm, liftM);
    if (ring.length >= 3) rings.push(ring);
  }
  if (rings.length === 0) {
    const ring = pathFromIsoD(d, origin, scale, pageHeightMm, liftM);
    if (ring.length >= 2) rings.push(ring);
  }
  return rings;
}

export function explodedAxoPageSize(
  model: CityModel,
  settings: ExplodedAxoSettings,
  scale: number,
): { widthMm: number; heightMm: number; origin: Pt } {
  const bounds = explodedAxoBounds(model, settings);
  const k = mmPerMetre(scale);
  const margin = model.sideM * 0.14 * k;
  const widthMm = (bounds.maxX - bounds.minX) * k + margin * 2;
  const heightMm = (bounds.maxY - bounds.minY) * k + margin * 2;
  return {
    widthMm,
    heightMm,
    origin: [bounds.minX - margin / k, bounds.minY - margin / k],
  };
}

export const EXPLODED_AXO_LAYER_ORDER = [
  "Guides",
  "Planning",
  "Water",
  "Hydro",
  "Transport",
  "Topography",
  "Roads",
  "Cadastre",
  "Green",
  "Trees",
  "Buildings",
  "Terrain",
  "Aerial",
  "Base",
  "Labels",
  "Annotation",
] as const;

function chunkNameForLayer(id: AxoLayerId): string {
  if (id === "planning") return "Planning";
  if (id === "water") return "Water";
  if (id === "hydro") return "Hydro";
  if (id === "transport") return "Transport";
  if (id === "topography") return "Topography";
  if (id === "terrain" || id === "aerial") return "Terrain";
  if (id === "roads") return "Roads";
  if (id === "cadastre") return "Cadastre";
  if (id === "green") return "Green";
  if (id === "trees") return "Trees";
  if (id === "buildings") return "Buildings";
  if (id === "base") return "Base";
  return "Terrain";
}

function fillPaint(layer: ReturnType<typeof buildExplodedAxoLayers>["layers"][number], index: number): AxoPaintKey {
  return layer.fillPaints?.[index] ?? axoLayerBasePaint(layer.id);
}

function strokePaint(layer: ReturnType<typeof buildExplodedAxoLayers>["layers"][number], index: number): AxoPaintKey {
  return layer.strokePaints?.[index] ?? axoLayerBasePaint(layer.id);
}

export function explodedAxoChunks(
  model: CityModel,
  scale: number,
  settings: ExplodedAxoSettings,
  satelliteNote?: string | null,
  overlays: ExplodedAxoOverlayBundle = {},
): PdfChunk[] {
  model = stableExportModel(model);
  const { layers, guides } = buildExplodedAxoLayers(model, settings, overlays);
  const page = explodedAxoPageSize(model, settings, scale);
  const origin: Pt = page.origin;
  const pageHeightMm = page.heightMm;
  const chunks: PdfChunk[] = [];
  const sourceNotes: string[] = [];

  const axoGuideDash = dashSegments(readDrawingStyle().axoGuideDash);
  const guidePaths: PdfPath[] = guides.map((guide) => ({
    rings: [
      [
        isoToSheet([guide.x, guide.yTop], origin, scale, pageHeightMm),
        isoToSheet([guide.x, guide.yBottom], origin, scale, pageHeightMm),
      ],
    ],
    stroke: hexRgb(getColour("--axo-guide-dash")),
    strokeMm: 0.08,
    close: false,
    ...(axoGuideDash ? { dashMm: axoGuideDash, cap: "round" as const } : {}),
  }));
  if (guidePaths.length) chunks.push({ name: "Guides", paths: guidePaths });

  for (const layer of axoLayersForPaint(layers)) {
    const chunkName = chunkNameForLayer(layer.id);
    const paths: PdfPath[] = [];
    const liftM = layer.liftM;
    const plateRing = pathFromIsoD(layer.plateOutlineD, origin, scale, pageHeightMm, liftM);
    const hasPlinth = Boolean(layer.plinthWalls && layer.plinthWalls.length > 0);
    if (plateRing.length >= 3) {
      paths.push({
        rings: [plateRing],
        ...(hasPlinth ? { fill: hexRgb(getColour("--ground-fill")) } : {}),
        stroke: hexRgb(
          hasPlinth
            ? getColour("--ground-edge")
            : layer.id === "base"
              ? getColour("--axo-base-outline")
              : axoPlateColours(layer.id).edge,
        ),
        strokeMm: layer.id === "base" ? 0.3 : hasPlinth ? 0.24 : 0.12,
        close: true,
        ...(hasPlinth ? { join: "round" as const } : {}),
      });
    }
    if (layer.topoContourStrokes?.length) {
      const style = readDrawingStyle();
      const contourDash = dashSegments(style.contour.dash);
      for (const stroke of layer.topoContourStrokes) {
        for (const ring of ringsFromIsoD(stroke, origin, scale, pageHeightMm, liftM)) {
          if (ring.length >= 2) {
            paths.push({
              rings: [ring],
              stroke: hexRgb(axoPaintColour("contour")),
              strokeMm: 0.12,
              close: false,
              ...(contourDash ? { dashMm: contourDash, cap: "round" as const } : {}),
            });
          }
        }
      }
    }
    for (const wall of layer.plinthWalls ?? []) {
      const rings = ringsFromIsoD(wall.d, origin, scale, pageHeightMm, liftM);
      if (rings.length > 0) {
        paths.push({
          rings,
          fill: hexRgb(wall.fill),
          stroke: hexRgb(wall.stroke),
          strokeMm: 0.2,
          close: true,
          evenOdd: false,
          join: "round",
        });
      }
    }
    layer.fills.forEach((fill, index) => {
      const rings = ringsFromIsoD(fill, origin, scale, pageHeightMm, liftM);
      if (rings.length > 0) {
        paths.push({
          rings,
          fill: hexRgb(axoPaintColour(fillPaint(layer, index))),
          close: true,
          evenOdd: true,
        });
      }
    });
    layer.strokes.forEach((stroke, index) => {
      const rings = ringsFromIsoD(stroke, origin, scale, pageHeightMm, liftM);
      const widthScale = layer.strokeWidthScales?.[index] ?? 1;
      const dashed = layer.strokeDashed?.[index];
      const paint = strokePaint(layer, index);
      const style = readDrawingStyle();
      const strokeDash = dashed ? dashSegments(paint === "contour" ? style.contour.dash : style.tram.dash) : null;
      for (const ring of rings) {
        if (ring.length >= 2) {
          paths.push({
            rings: [ring],
            stroke: hexRgb(dashed && paint !== "contour" ? getColour("--tram-line-stroke") : axoPaintColour(paint)),
            strokeMm: (dashed && paint !== "contour" ? style.tram.mm : 0.25) * widthScale,
            close: false,
            ...(strokeDash ? { dashMm: strokeDash, cap: "round" as const } : {}),
          });
        }
      }
    });
    for (const stroke of layer.unclippedStrokes ?? []) {
      for (const ring of ringsFromIsoD(stroke, origin, scale, pageHeightMm, liftM)) {
        if (ring.length >= 2) {
          paths.push({ rings: [ring], stroke: hexRgb(axoPaintColour("terrain-mesh")), strokeMm: 0.08, close: false });
        }
      }
    }
    if (layer.sourceNote) sourceNotes.push(layer.sourceNote);
    else if (layer.unavailableNote && layer.unavailableNote !== "unavailable") sourceNotes.push(layer.unavailableNote);
    for (const marker of layer.markers ?? []) {
      const [sx, sy] = isoBaseToSheet(marker.x, marker.y, liftM, origin, scale, pageHeightMm);
      const r = marker.radiusM * mmPerMetre(scale);
      paths.push({
        rings: [
          [
            [sx + r, sy],
            [sx, sy + r],
            [sx - r, sy],
            [sx, sy - r],
            [sx + r, sy],
          ],
        ],
        fill: hexRgb(axoPaintColour(marker.paint)),
        close: true,
      });
    }
    for (const face of layer.solids ?? []) {
      const rings = ringsFromIsoD(face.d, origin, scale, pageHeightMm, liftM);
      if (rings.length > 0) {
        paths.push({
          rings,
          fill: hexRgb(face.fill ?? axoPaintColour(face.paint)),
          ...(face.paint.startsWith("building")
            ? { stroke: hexRgb(getColour("--axo-building-edge")), strokeMm: 0.05 }
            : {}),
          close: true,
          evenOdd: true,
        });
      }
    }
    if ((layer.id === "terrain" || layer.id === "aerial") && satelliteNote) {
      paths.push({
        rings: [plateRing],
        stroke: hexRgb(getColour("--axo-guide")),
        strokeMm: 0.15,
        close: true,
      });
    }
    if (paths.length) chunks.push({ name: chunkName, paths });
  }

  if (settings.showLabels) {
    const texts: PdfText[] = [];
    const leaders: PdfPath[] = [];
    for (const layer of layers) {
      const anchor = axoLayerLabelAnchor(model.sideM, layer.liftM, model.frameShape ?? "square");
      const [sx, sy] = isoToSheet([anchor.x, anchor.y], origin, scale, pageHeightMm);
      texts.push({
        x: sx,
        y: sy,
        sizeMm: model.sideM * 0.03 * mmPerMetre(scale),
        text: axoPlateLabelText(layer.id),
        color: hexRgb(getColour("--axo-label")),
      });
      leaders.push({
        rings: [
          [
            isoToSheet([anchor.leader.x1, anchor.leader.y1], origin, scale, pageHeightMm),
            isoToSheet([anchor.leader.x2, anchor.leader.y2], origin, scale, pageHeightMm),
          ],
        ],
        stroke: hexRgb(axoPlateColours(layer.id).edge),
        strokeMm: 0.12,
        close: false,
      });
    }
    if (texts.length) chunks.push({ name: "Labels", texts, paths: leaders });
  }

  const title = `${model.placeLabel} · Exploded axo · 1:${scale} · ${formatCoord(model.center.lat)}, ${formatCoord(model.center.lon)}`;
  const overlayOn =
    settings.layerVisible.planning ||
    settings.layerVisible.hydro ||
    settings.layerVisible.transport ||
    settings.layerVisible.topography;
  const credit = plainDataCredit({
    prefix: "CityCut.",
    windOn: false,
    satelliteOn: true,
    explodedAxoOverlaysOn: overlayOn,
    cadastreOn: settings.layerVisible.cadastre,
    ...(model.region === "nsw" ? { nsw: true } : {}),
  });
  const treesCredit = comTreesCreditLine(model);
  const nswCredit = regionCredit(model.region);
  const regional = nswCredit ? `${credit} ${nswCredit}.` : credit;
  const credited = treesCredit ? `${regional} ${treesCredit}.` : regional;
  const withSatellite = satelliteNote ? `${credited} ${satelliteNote}` : credited;
  const note = sourceNotes.length ? `${withSatellite} ${sourceNotes.join(". ")}.` : withSatellite;
  chunks.push({
    name: "Annotation",
    texts: [
      {
        x: 8,
        y: 8,
        sizeMm: 3,
        text: title,
        color: hexRgb(getColour("--axo-label")),
      },
      {
        x: 8,
        y: 12,
        sizeMm: 2.4,
        text: note,
        color: hexRgb(getColour("--axo-label")),
      },
    ],
  });

  return chunks;
}
