import { fitPlanOrthoZoom } from "./planCamera";
import type { Aabb } from "./isoCamera";
import type { ViewportRect } from "./captureViewportPng";

export type WindSheetFraming = "whole-site" | "saved";

export const WIND_SHEET_FRAMING: WindSheetFraming = "whole-site";

export type WholeSiteFraming = { zoom: number; targetX: number; targetZ: number };

export type CameraViewOffset = { enabled: boolean; fullWidth: number; fullHeight: number; offsetX: number; offsetY: number; width: number; height: number };

export function projectionCentre(canvas: { width: number; height: number }, view: CameraViewOffset | null | undefined): { x: number; y: number } {
  if (!view?.enabled) return { x: canvas.width / 2, y: canvas.height / 2 };
  return {
    x: ((view.fullWidth / 2 - view.offsetX) * canvas.width) / view.width,
    y: ((view.fullHeight / 2 - view.offsetY) * canvas.height) / view.height,
  };
}

export function wholeSiteFraming(bounds: Aabb, centre: { x: number; y: number }, crop: ViewportRect): WholeSiteFraming {
  const zoom = fitPlanOrthoZoom(bounds, crop.width, crop.height);
  const siteX = (bounds.min[0] + bounds.max[0]) / 2;
  const siteZ = (bounds.min[2] + bounds.max[2]) / 2;
  return {
    zoom,
    targetX: siteX - (crop.x + crop.width / 2 - centre.x) / zoom,
    targetZ: siteZ - (crop.y + crop.height / 2 - centre.y) / zoom,
  };
}
