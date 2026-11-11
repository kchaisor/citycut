import { getColour } from "./colours";
import { svgRings } from "./svgPlan";
import type { SunStudyLayer } from "../components/useSunStudyShadows";
import { SUN_STUDY_SHADOW_ADDED_OPACITY, SUN_STUDY_SHADOW_OPACITY } from "./sunStudyPlan";
import type { Ring } from "../types";

export type SunStudyHourRaster = {
  hour: number;
  href: string;
  east: number;
  north: number;
  widthM: number;
  heightM: number;
};

function pathFromPolygonRings(polygonRings: Ring[]): Path2D | null {
  const d = svgRings(polygonRings);
  if (!d) return null;
  try {
    return new Path2D(d);
  } catch {
    return null;
  }
}

function drawPolygonRings(
  ctx: CanvasRenderingContext2D,
  polygonRings: Ring[],
  fill: string,
  opacity: number,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const path = pathFromPolygonRings(polygonRings);
  if (!path) return;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.fillStyle = fill;
  ctx.globalAlpha = opacity;
  ctx.fill(path, "evenodd");
  ctx.restore();
}

export function rasterizePlanShadowRings(
  ringGroups: readonly Ring[][],
  sideM: number,
  fill: string,
  opacity: number,
): { href: string; east: number; north: number; widthM: number; heightM: number } | null {
  if (ringGroups.length === 0 || typeof document === "undefined") return null;
  const half = sideM / 2;
  const widthM = sideM;
  const heightM = sideM;
  const ppm = 3;
  const widthPx = Math.ceil(widthM * ppm);
  const heightPx = Math.ceil(heightM * ppm);
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const offsetX = widthPx / 2;
  const offsetY = heightPx / 2;
  const scale = ppm;
  for (const polygonRings of ringGroups) {
    drawPolygonRings(ctx, polygonRings, fill, opacity, scale, offsetX, offsetY);
  }
  return {
    href: canvas.toDataURL("image/png"),
    east: -half,
    north: -half,
    widthM,
    heightM,
  };
}

export function rasterizeSunStudyLayers(
  layers: readonly SunStudyLayer[],
  sideM: number,
  existingFillKey: "--sun-study-shadow" = "--sun-study-shadow",
  addedFillKey: "--sun-study-shadow-added" = "--sun-study-shadow-added",
): SunStudyHourRaster[] {
  if (layers.length === 0 || typeof document === "undefined") return [];
  const half = sideM / 2;
  const widthM = sideM;
  const heightM = sideM;
  const ppm = 3;
  const widthPx = Math.ceil(widthM * ppm);
  const heightPx = Math.ceil(heightM * ppm);
  const existingFill = getColour(existingFillKey);
  const addedFill = getColour(addedFillKey);
  const out: SunStudyHourRaster[] = [];
  for (const layer of layers) {
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    const offsetX = widthPx / 2;
    const offsetY = heightPx / 2;
    const scale = ppm;
    for (const polygonRings of layer.rings) {
      drawPolygonRings(ctx, polygonRings, existingFill, SUN_STUDY_SHADOW_OPACITY, scale, offsetX, offsetY);
    }
    for (const polygonRings of layer.addedRings) {
      drawPolygonRings(ctx, polygonRings, addedFill, SUN_STUDY_SHADOW_ADDED_OPACITY, scale, offsetX, offsetY);
    }
    out.push({
      hour: layer.hour,
      href: canvas.toDataURL("image/png"),
      east: -half,
      north: -half,
      widthM,
      heightM,
    });
  }
  return out;
}
