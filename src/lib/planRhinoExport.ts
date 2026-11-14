import type { PdfChunk, PdfPath, Rgb } from "./aiDocument";
import { aiLayerLabel, pdfChunkHasDrawableOps } from "./aiNative";
import {
  sitePlanChunks,
  sitePlanLayerOrder,
  type SitePlanExportOptions,
} from "./aiPlan";
import { colourRgb } from "./colours";
import { mgaCrs, projectLocal } from "./crs";
import { readDrawingStyle, type LineStyles } from "./drawingStyle";
import { layoutSheet, type SheetLayout } from "./figureGround";
import { applyRhinoMgaDocumentSettings, loadRhino } from "./rhinoExport";
import type { CityModel } from "../types";

type ByteRgb = { r: number; g: number; b: number };

const PLAN_Z = 0;

const SKIP_LAYERS = new Set(["Frame", "Annotation", "NSW planning labels", "Contour labels"]);

type Rhino = Awaited<ReturnType<typeof loadRhino>>;

function release(object: object) {
  (object as { delete?: () => void }).delete?.();
}

function displayColor(color: ByteRgb) {
  return { r: color.r, g: color.g, b: color.b, a: 255 };
}

function unitRgbToByte(rgb: Rgb): ByteRgb {
  return {
    r: Math.round(rgb[0] * 255),
    g: Math.round(rgb[1] * 255),
    b: Math.round(rgb[2] * 255),
  };
}

function chunkLayerColor(chunk: PdfChunk): ByteRgb {
  const path =
    chunk.paths?.find((candidate) => candidate.fill || candidate.stroke) ??
    chunk.paths?.[0];
  if (path?.fill) return unitRgbToByte(path.fill);
  if (path?.stroke) return unitRgbToByte(path.stroke);
  const ellipse = chunk.ellipses?.find((candidate) => candidate.fill || candidate.stroke);
  if (ellipse?.fill) return unitRgbToByte(ellipse.fill);
  if (ellipse?.stroke) return unitRgbToByte(ellipse.stroke);
  return colourRgb("--building-uniform");
}

function parentLayerFallback(name: string): ByteRgb {
  if (name === "Imported") return colourRgb("--imported-massing");
  return colourRgb("--building-uniform");
}

function ensureMaterial(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  materials: Map<string, number>,
  name: string,
  color: ByteRgb,
): number {
  const cached = materials.get(name);
  if (cached !== undefined) return cached;
  const material = new rhino.Material();
  material.name = name;
  const swatch = displayColor(color);
  material.diffuseColor = swatch as unknown as number[];
  material.ambientColor = swatch as unknown as number[];
  const index = doc.materials().count;
  doc.materials().add(material);
  materials.set(name, index);
  release(material);
  return index;
}

function ensureLayer(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layers: Map<string, number>,
  materials: Map<string, number>,
  name: string,
  color: ByteRgb,
): number {
  const cached = layers.get(name);
  if (cached !== undefined) return cached;
  const parts = name.split("::");
  const layer = new rhino.Layer();
  layer.name = parts.length === 2 ? parts[1]! : name;
  const swatch = displayColor(color);
  layer.color = swatch;
  layer.plotColor = swatch;
  if (parts.length === 2) {
    const parentIndex = ensureLayer(rhino, doc, layers, materials, parts[0]!, parentLayerFallback(parts[0]!));
    layer.parentLayerId = doc.layers().get(parentIndex).id;
  }
  layer.renderMaterialIndex = ensureMaterial(rhino, doc, materials, name, color);
  const index = doc.layers().add(layer);
  layers.set(name, index);
  return index;
}

function applyByLayerAttributes(rhino: Rhino, attributes: InstanceType<Rhino["ObjectAttributes"]>) {
  attributes.colorSource = rhino.ObjectColorSource.ColorFromLayer;
  attributes.materialSource = rhino.ObjectMaterialSource.MaterialFromLayer;
  attributes.plotColorSource = rhino.ObjectPlotColorSource.PlotColorFromLayer;
}

export function localFromSheetPoint(
  sheetX: number,
  sheetY: number,
  sideM: number,
  layout: SheetLayout,
): [number, number] {
  const half = sideM / 2;
  const east = ((sheetX - layout.frameX) / layout.frameMm) * sideM - half;
  const yDown = layout.pageHeightMm - sheetY;
  const north = half - ((yDown - layout.frameY) / layout.frameMm) * sideM;
  return [east, north];
}

function addMgaPolyline(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layerIndex: number,
  model: CityModel,
  zone: number,
  layout: SheetLayout,
  ring: number[][],
  close: boolean,
  objectName: string,
) {
  if (ring.length < 2) return;
  const points: number[][] = [];
  for (const [sheetX, sheetY] of ring) {
    const local = localFromSheetPoint(sheetX, sheetY, model.sideM, layout);
    const [easting, northing] = projectLocal(local, model.center, zone);
    const last = points[points.length - 1];
    if (last && Math.hypot(last[0]! - easting, last[1]! - northing) < 0.0005) continue;
    points.push([easting, northing, PLAN_Z]);
  }
  if (points.length < 2) return;
  if (close && points.length >= 3) points.push(points[0]!);
  const attributes = new rhino.ObjectAttributes();
  attributes.name = objectName;
  attributes.layerIndex = layerIndex;
  applyByLayerAttributes(rhino, attributes);
  doc.objects().addPolyline(points, attributes);
  release(attributes);
}

function addPath(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layerIndex: number,
  path: PdfPath,
  model: CityModel,
  zone: number,
  layout: SheetLayout,
  layerName: string,
) {
  const close = path.close ?? false;
  for (const ring of path.rings) {
    addMgaPolyline(rhino, doc, layerIndex, model, zone, layout, ring, close && ring.length >= 3, layerName);
  }
}

function writeChunkGeometry(
  rhino: Rhino,
  doc: InstanceType<Rhino["File3dm"]>,
  layerIndex: number,
  chunk: PdfChunk,
  model: CityModel,
  zone: number,
  layout: SheetLayout,
) {
  for (const path of chunk.paths ?? []) {
    addPath(rhino, doc, layerIndex, path, model, zone, layout, chunk.name);
  }
  for (const ellipse of chunk.ellipses ?? []) {
    const segments = 36;
    const ring: number[][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      ring.push([ellipse.cx + Math.cos(angle) * ellipse.rx, ellipse.cy + Math.sin(angle) * ellipse.ry]);
    }
    addMgaPolyline(rhino, doc, layerIndex, model, zone, layout, ring, true, `${chunk.name} tree`);
  }
}

function chunkExportsToPlan(chunk: PdfChunk): boolean {
  return pdfChunkHasDrawableOps(chunk);
}

function exportablePlanLayers(
  model: CityModel,
  scale: number,
  style: LineStyles,
  exportOptions?: SitePlanExportOptions | null,
): { chunkName: string; exportName: string; chunk: PdfChunk }[] {
  const chunks = sitePlanChunks(model, scale, style, exportOptions);
  return sitePlanLayerOrder(chunks).flatMap((chunkName) => {
    if (SKIP_LAYERS.has(chunkName)) return [];
    const chunk = chunks.find((candidate) => candidate.name === chunkName);
    if (!chunk || !chunkExportsToPlan(chunk)) return [];
    return [{ chunkName, exportName: aiLayerLabel(chunkName), chunk }];
  });
}

export function sitePlanRhinoLayerNames(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  exportOptions?: SitePlanExportOptions | null,
): string[] {
  return exportablePlanLayers(model, scale, style ?? readDrawingStyle(), exportOptions).map((row) => row.exportName);
}

export async function sitePlanTo3dm(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  exportOptions?: SitePlanExportOptions | null,
): Promise<Uint8Array> {
  const styles = style ?? readDrawingStyle();
  const layout = layoutSheet(model.sideM, scale);
  const crs = mgaCrs(model.center.lon);
  const rhino = await loadRhino();
  const doc = new rhino.File3dm();
  try {
    const { zone } = applyRhinoMgaDocumentSettings(rhino, doc, model, {
      windOn: Boolean(exportOptions && "wind" in exportOptions && exportOptions.wind?.table),
      applicationDetails: `${model.placeLabel}; site plan; ${crs.name}`,
    });
    const layers = new Map<string, number>();
    const materials = new Map<string, number>();
    for (const { exportName, chunk } of exportablePlanLayers(model, scale, styles, exportOptions)) {
      const layerIndex = ensureLayer(rhino, doc, layers, materials, exportName, chunkLayerColor(chunk));
      writeChunkGeometry(rhino, doc, layerIndex, chunk, model, zone, layout);
    }
    return doc.toByteArray();
  } finally {
    doc.destroy();
  }
}
