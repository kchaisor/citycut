import type { LonLat, UiLayers } from "../types";

export const MELBOURNE: LonLat = { lon: 144.9631, lat: -37.8136 };
export const MELBOURNE_LABEL = "Melbourne CBD";
export const DEFAULT_ZOOM = 15;
export const MIN_SIDE_KM = 0.25;
export const MAX_SIDE_KM = 2;
export const DEFAULT_SIDE_KM = 1;
/** Square side² or circle π (side/2)² cap in m² (2 km square → 4 km²). */
export const MAX_AREA_M2 = 4_000_000;

export const DEFAULT_LAYERS: UiLayers = {
  buildings: true,
  roads: true,
  terrain: true,
  contours: true,
  waterGreen: true,
  trees: false,
  satellite: false,
};

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "satellite",
      type: "raster" as const,
      source: "satellite",
    },
  ],
};
