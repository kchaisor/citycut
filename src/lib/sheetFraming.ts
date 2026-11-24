import { fitPlanOrthoZoom } from "./planCamera";
import type { Aabb } from "./isoCamera";
import type { ViewportRect } from "./captureViewportPng";

export type WindSheetFraming = "whole-site" | "saved";

export const WIND_SHEET_FRAMING: WindSheetFraming = "whole-site";

export type WholeSiteFraming = { zoom: number; targetX: number; targetZ: number };

export function wholeSiteFraming(bounds: Aabb, canvas: { width: number; height: number }, crop: ViewportRect): WholeSiteFraming {
  const zoom = fitPlanOrthoZoom(bounds, crop.width, crop.height);
  const siteX = (bounds.min[0] + bounds.max[0]) / 2;
  const siteZ = (bounds.min[2] + bounds.max[2]) / 2;
  return {
    zoom,
    targetX: siteX - (crop.x + crop.width / 2 - canvas.width / 2) / zoom,
    targetZ: siteZ - (crop.y + crop.height / 2 - canvas.height / 2) / zoom,
  };
}
