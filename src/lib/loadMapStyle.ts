import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { MAP_STYLE, SATELLITE_STYLE } from "../content/constants";
import { sanitizeMapStyle } from "./sanitizeMapStyle";
import type { Basemap } from "../types";

export type BasemapStyleLoadResult = {
  style: StyleSpecification | string;
  styleLoadFailed: boolean;
};

export async function loadBasemapStyle(basemap: Basemap): Promise<BasemapStyleLoadResult> {
  if (basemap === "satellite") {
    return { style: sanitizeMapStyle(structuredClone(SATELLITE_STYLE)), styleLoadFailed: false };
  }
  try {
    const response = await fetch(MAP_STYLE);
    if (!response.ok) throw new Error("Map style failed to load.");
    const json = (await response.json()) as StyleSpecification;
    return { style: sanitizeMapStyle(json), styleLoadFailed: false };
  } catch {
    return { style: MAP_STYLE, styleLoadFailed: true };
  }
}

export function transformMapStyle(
  _previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  return sanitizeMapStyle(next);
}

export function applyBasemapStyleToMap(map: MapLibreMap, style: StyleSpecification | string): void {
  if (typeof style === "string") {
    map.setStyle(style, { transformStyle: transformMapStyle });
  } else {
    map.setStyle(style);
  }
}
