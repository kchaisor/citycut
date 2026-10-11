import type { StyleSpecification } from "maplibre-gl";
import { MAP_STYLE, SATELLITE_STYLE } from "../content/constants";
import { sanitizeMapStyle } from "./sanitizeMapStyle";
import type { Basemap } from "../types";

export async function loadBasemapStyle(basemap: Basemap): Promise<StyleSpecification> {
  if (basemap === "satellite") {
    return sanitizeMapStyle(structuredClone(SATELLITE_STYLE));
  }
  const response = await fetch(MAP_STYLE);
  if (!response.ok) throw new Error("Map style failed to load.");
  const json = (await response.json()) as StyleSpecification;
  return sanitizeMapStyle(json);
}
