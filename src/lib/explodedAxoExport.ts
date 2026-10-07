import type { PdfChunk, PdfPath, PdfText } from "./aiDocument";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import { formatCoord } from "./geo";
import { plainDataCredit } from "./dataCredits";
import {
  AXO_LAYER_LABELS,
  axoLayerLabelAnchor,
  axoLayersForPaint,
  buildExplodedAxoLayers,
  explodedAxoBounds,
  type AxoLayerId,
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
  "Aerial",
  "Buildings",
  "Green",
  "Roads",
  "Water",
  "Labels",
  "Annotation",
] as const;

export function explodedAxoChunks(
  model: CityModel,
  scale: number,
  settings: ExplodedAxoSettings,
  satelliteNote?: string | null,
): PdfChunk[] {
  const { layers, guides } = buildExplodedAxoLayers(model, settings);
  const page = explodedAxoPageSize(model, settings, scale);
  const origin: Pt = page.origin;
  const pageHeightMm = page.heightMm;
  const chunks: PdfChunk[] = [];

  const guidePaths: PdfPath[] = guides.map((guide) => ({
    rings: [
      [
        isoToSheet([guide.x, guide.yTop], origin, scale, pageHeightMm),
        isoToSheet([guide.x, guide.yBottom], origin, scale, pageHeightMm),
      ],
    ],
    stroke: hexRgb(getColour("--axo-guide")),
    strokeMm: 0.08,
    close: false,
  }));
  if (guidePaths.length) chunks.push({ name: "Guides", paths: guidePaths });

  const layerColour: Record<AxoLayerId, string> = {
    water: getColour("--axo-water"),
    roads: getColour("--axo-road"),
    green: getColour("--axo-green"),
    buildings: getColour("--axo-building"),
    aerial: getColour("--axo-building"),
  };

  for (const layer of axoLayersForPaint(layers)) {
    const chunkName =
      layer.id === "water"
        ? "Water"
        : layer.id === "roads"
          ? "Roads"
          : layer.id === "green"
            ? "Green"
            : layer.id === "buildings"
              ? "Buildings"
              : "Aerial";
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
    for (const fill of layer.fills) {
      const rings = ringsFromIsoD(fill, origin, scale, pageHeightMm, liftM);
      if (rings.length > 0) {
        paths.push({ rings, fill: hexRgb(layerColour[layer.id]), close: true, evenOdd: true });
      }
    }
    for (const stroke of layer.strokes) {
      const rings = ringsFromIsoD(stroke, origin, scale, pageHeightMm, liftM);
      for (const ring of rings) {
        if (ring.length >= 2) {
          paths.push({
            rings: [ring],
            stroke: hexRgb(layerColour[layer.id]),
            strokeMm: 0.25,
            close: false,
          });
        }
      }
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
      });
    }
    if (texts.length) chunks.push({ name: "Labels", texts });
  }

  const title = `${model.placeLabel} · Exploded axo · 1:${scale} · ${formatCoord(model.center.lat)}, ${formatCoord(model.center.lon)}`;
  const credit = plainDataCredit({ prefix: "CityCut.", windOn: false, satelliteOn: true });
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
