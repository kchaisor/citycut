import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildCityGroup, disposeObject } from "./buildCity";
import { figureGroundPdf, figureGroundSvg } from "./figureGround";
import { sitePlanSvg } from "./svgPlan";
import type { CityModel } from "../types";

export function fileStem(model: CityModel): string {
  const lat = `${Math.abs(model.center.lat).toFixed(4)}${model.center.lat < 0 ? "S" : "N"}`;
  const lon = `${Math.abs(model.center.lon).toFixed(4)}${model.center.lon < 0 ? "W" : "E"}`;
  return `citycut-${lat}-${lon}-${Math.round(model.sideM)}m`;
}

export function pngFilename(model: CityModel): string {
  return `${fileStem(model)}.png`;
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

export async function download3dm(model: CityModel): Promise<void> {
  const { cityModelTo3dm } = await import("./rhinoExport");
  const bytes = await cityModelTo3dm(model);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(`${fileStem(model)}.3dm`, new Blob([copy], { type: "application/octet-stream" }));
}

export function downloadSvg(model: CityModel) {
  const svg = sitePlanSvg(model);
  downloadBlob(
    `${fileStem(model)}.svg`,
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
}

export function figureGroundStem(model: CityModel, scale: number, extension: "svg" | "pdf"): string {
  return `${fileStem(model)}-figure-ground-1-${scale}.${extension}`;
}

/** True-scale figure-ground sheet. A variant of the site-plan SVG, on A3 when the frame fits. */
export function downloadFigureGround(model: CityModel, scale: number, extension: "svg" | "pdf") {
  const name = figureGroundStem(model, scale, extension);
  if (extension === "svg") {
    downloadBlob(name, new Blob([figureGroundSvg(model, scale)], { type: "image/svg+xml;charset=utf-8" }));
    return;
  }
  const bytes = figureGroundPdf(model, scale);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(name, new Blob([copy], { type: "application/pdf" }));
}

export async function downloadGlb(model: CityModel): Promise<void> {
  const group = buildCityGroup(model);
  try {
    const exporter = new GLTFExporter();
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        group,
        (result) => {
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error("CityCut expected a binary glTF."));
        },
        (error) => reject(error),
        { binary: true },
      );
    });
    downloadBlob(
      `${fileStem(model)}.glb`,
      new Blob([buffer], { type: "model/gltf-binary" }),
    );
  } finally {
    disposeObject(group);
  }
}
