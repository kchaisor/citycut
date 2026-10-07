import { explodedAxoAi, figureGroundAi, sitePlanAi } from "./aiPlan";
import { defaultExplodedAxoSettings, type ExplodedAxoSettings } from "./explodedAxo";
import type { LineStyles } from "./drawingStyle";
import { viewAi, type ViewStyle } from "./aiView";
import type { CameraShot } from "./cameraShot";
import { slugifyPlace } from "./placeLabel";
import type { SitePlanExportOptions } from "./aiPlan";
import type { HeliodonDiagramExportOptions, HeliodonGroundExportOptions } from "./heliodonDiagram";
import type { PlanShadowInput } from "./buildingShadows";
import type { CityModel } from "../types";

/** Downloads the drawer still offers. glTF, SVG, and figure-ground PDF are gone. */
export const EXPORT_IDS = ["png", "3dm", "ai-view", "ai-site", "ai-figure", "ai-exploded"] as const;

export type ExportId = (typeof EXPORT_IDS)[number];

export function fileStem(model: CityModel): string {
  const lat = `${Math.abs(model.center.lat).toFixed(4)}${model.center.lat < 0 ? "S" : "N"}`;
  const lon = `${Math.abs(model.center.lon).toFixed(4)}${model.center.lon < 0 ? "W" : "E"}`;
  const tail = `${lat}-${lon}-${Math.round(model.sideM)}m`;
  const slug = slugifyPlace(model.placeLabel);
  return slug ? `citycut-${slug}-${tail}` : `citycut-${tail}`;
}

export function pngFilename(model: CityModel): string {
  return `${fileStem(model)}.png`;
}

export function aiFilename(
  model: CityModel,
  kind: "view" | "site" | "figure" | "exploded",
  scale?: number,
): string {
  const stem = fileStem(model);
  if (kind === "view") return `${stem}-view.ai`;
  if (kind === "site") return `${stem}-site-1-${scale}.ai`;
  if (kind === "figure") return `${stem}-figure-ground-1-${scale}.ai`;
  return `${stem}-exploded-axo-1-${scale}.ai`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(filename, new Blob([copy], { type }));
}

export type RhinoDownloadOptions = {
  heliodon?: HeliodonGroundExportOptions | null;
  shadows?: PlanShadowInput | null;
  castShadows?: boolean;
  uniformBuildings?: boolean;
  colourBySource?: boolean;
  wind?: { table: import("./windRose").WindRoseTable; period: import("./windRose").WindPeriodId } | null;
};

export async function download3dm(
  model: CityModel,
  options?: HeliodonGroundExportOptions | RhinoDownloadOptions | null,
): Promise<void> {
  const { cityModelTo3dm } = await import("./rhinoExport");
  const bytes = await cityModelTo3dm(model, options);
  downloadBytes(`${fileStem(model)}.3dm`, bytes, "application/octet-stream");
}

export async function downloadSiteAi(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  exportOptions?: SitePlanExportOptions | HeliodonDiagramExportOptions | null,
): Promise<void> {
  const bytes = await sitePlanAi(model, scale, style, exportOptions);
  downloadBytes(aiFilename(model, "site", scale), bytes, "application/pdf");
}

export async function downloadFigureAi(
  model: CityModel,
  scale: number,
  style?: LineStyles,
  heliodon?: HeliodonDiagramExportOptions | null,
): Promise<void> {
  const bytes = await figureGroundAi(model, scale, style, heliodon);
  downloadBytes(aiFilename(model, "figure", scale), bytes, "application/pdf");
}

export async function downloadExplodedAxoAi(
  model: CityModel,
  scale: number,
  settings: ExplodedAxoSettings = defaultExplodedAxoSettings(model.sideM),
  satelliteNote?: string,
): Promise<void> {
  const bytes = await explodedAxoAi(model, scale, settings, satelliteNote);
  downloadBytes(aiFilename(model, "exploded", scale), bytes, "application/pdf");
}

export async function downloadViewAi(model: CityModel, shot: CameraShot, style: ViewStyle): Promise<void> {
  const bytes = await viewAi(model, shot, style);
  downloadBytes(aiFilename(model, "view"), bytes, "application/pdf");
}
