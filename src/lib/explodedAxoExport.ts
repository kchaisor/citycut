import type { PdfChunk, PdfPath, PdfText } from "./aiDocument";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import { formatCoord } from "./geo";
import { plainDataCredit } from "./dataCredits";
import { dashSegments, readDrawingStyle } from "./drawingStyle";
import {
  AXO_LAYER_LABELS,
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
  "Green",
  "Trees",
  "Buildings",
  "Aerial",
  "Labels",
  "Annotation",
] as const;

function chunkNameForLayer(id: AxoLayerId): string {
  if (id === "planning") return "Planning";
  if (id === "water") return "Water";
  if (id === "hydro") return "Hydro";
  if (id === "transport") return "Transport";
  if (id === "topography") return "Topography";
  if (id === "roads") return "Roads";
  if (id === "green") return "Green";
  if (id === "trees") return "Trees";
  if (id === "buildings") return "Buildings";
  return "Aerial";
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
  const { layers, guides } = buildExplodedAxoLayers(model, settings, overlays);
  const page = explodedAxoPageSize(model, settings, scale);
  const origin: Pt = page.origin;
  const pageHeightMm = page.heightMm;
  const chunks: PdfChunk[] = [];

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
    if (plateRing.length >= 3) {
      paths.push({
        rings: [plateRing],
        stroke: hexRgb(getColour("--axo-guide")),
        strokeMm: 0.12,
        close: true,
      });
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
      const tramDash = dashed ? dashSegments(readDrawingStyle().tram.dash) : null;
      for (const ring of rings) {
        if (ring.length >= 2) {
          paths.push({
            rings: [ring],
            stroke: hexRgb(dashed ? getColour("--tram-line-stroke") : axoPaintColour(strokePaint(layer, index))),
            strokeMm: (dashed ? readDrawingStyle().tram.mm : 0.25) * widthScale,
            close: false,
            ...(tramDash ? { dashMm: tramDash, cap: "round" as const } : {}),
          });
        }
      }
    });
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
    if (layer.id === "aerial" && satelliteNote) {
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
    for (const layer of layers) {
      const anchor = axoLayerLabelAnchor(model.sideM, layer.liftM);
      const [sx, sy] = isoToSheet([anchor.x, anchor.y], origin, scale, pageHeightMm);
      texts.push({
        x: sx,
        y: sy,
        sizeMm: model.sideM * 0.022 * mmPerMetre(scale),
        text: AXO_LAYER_LABELS[layer.id],
        color: hexRgb(getColour("--axo-label")),
        rotateDeg: anchor.rotateDeg + 180,
      });
    }
    if (texts.length) chunks.push({ name: "Labels", texts });
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
  });
  const note = satelliteNote ? `${credit} ${satelliteNote}` : credit;
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
