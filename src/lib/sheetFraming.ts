import { fitPlanOrthoZoom } from "./planCamera";
import type { Aabb } from "./isoCamera";
import type { ViewportRect } from "./captureViewportPng";

export type WindSheetFraming = "whole-site" | "saved";

export const WIND_SHEET_FRAMING: WindSheetFraming = "whole-site";

export const WIND_SHEET_MARGIN = 0.045;

export const WIND_SHEET_FRAMING_STORAGE_KEY = "citycut.windSheetFraming.v1";

export type WindSheetFramingStore = Record<string, WindSheetFraming>;

export type WindSheetFramingStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function isWindSheetFraming(value: unknown): value is WindSheetFraming {
  return value === "whole-site" || value === "saved";
}

export function readWindSheetFramingStore(storage: WindSheetFramingStorage): WindSheetFramingStore {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(WIND_SHEET_FRAMING_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const store: WindSheetFramingStore = {};
    for (const [cutId, value] of Object.entries(parsed)) if (isWindSheetFraming(value)) store[cutId] = value;
    return store;
  } catch {
    return {};
  }
}

export function writeWindSheetFramingStore(storage: WindSheetFramingStorage, store: WindSheetFramingStore): boolean {
  try {
    storage.setItem(WIND_SHEET_FRAMING_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function windSheetFramingForCut(store: WindSheetFramingStore, cutId: string): WindSheetFraming {
  return store[cutId] ?? WIND_SHEET_FRAMING;
}

export type WholeSiteFraming = { zoom: number; targetX: number; targetZ: number };

export type CameraViewOffset = { enabled: boolean; fullWidth: number; fullHeight: number; offsetX: number; offsetY: number; width: number; height: number };

export function projectionCentre(canvas: { width: number; height: number }, view: CameraViewOffset | null | undefined): { x: number; y: number } {
  if (!view?.enabled) return { x: canvas.width / 2, y: canvas.height / 2 };
  return {
    x: ((view.fullWidth / 2 - view.offsetX) * canvas.width) / view.width,
    y: ((view.fullHeight / 2 - view.offsetY) * canvas.height) / view.height,
  };
}

export function expandedSiteBounds(bounds: Aabb, margin: number): Aabb {
  const padX = (bounds.max[0] - bounds.min[0]) * margin;
  const padZ = (bounds.max[2] - bounds.min[2]) * margin;
  return {
    min: [bounds.min[0] - padX, bounds.min[1], bounds.min[2] - padZ],
    max: [bounds.max[0] + padX, bounds.max[1], bounds.max[2] + padZ],
  };
}

export type CutExtentM = { width: number; height: number };

export function cutMarginTrim(
  capture: { width: number; height: number },
  metresAcross: number,
  cut: CutExtentM,
  margin: number,
): ViewportRect | null {
  if (!(metresAcross > 0) || !(cut.width > 0) || !(cut.height > 0)) return null;
  const pxPerMetre = capture.width / metresAcross;
  const halfWidth = Math.min((cut.width * (1 + 2 * margin) * pxPerMetre) / 2, capture.width / 2);
  const halfHeight = Math.min((cut.height * (1 + 2 * margin) * pxPerMetre) / 2, capture.height / 2);
  return {
    x: Math.round(capture.width / 2 - halfWidth),
    y: Math.round(capture.height / 2 - halfHeight),
    width: Math.round(halfWidth * 2),
    height: Math.round(halfHeight * 2),
  };
}

export function wholeSiteFraming(bounds: Aabb, centre: { x: number; y: number }, crop: ViewportRect, margin = 0): WholeSiteFraming {
  const zoom = fitPlanOrthoZoom(margin > 0 ? expandedSiteBounds(bounds, margin) : bounds, crop.width, crop.height);
  const siteX = (bounds.min[0] + bounds.max[0]) / 2;
  const siteZ = (bounds.min[2] + bounds.max[2]) / 2;
  return {
    zoom,
    targetX: siteX - (crop.x + crop.width / 2 - centre.x) / zoom,
    targetZ: siteZ - (crop.y + crop.height / 2 - centre.y) / zoom,
  };
}
