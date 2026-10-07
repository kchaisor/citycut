import type maplibregl from "maplibre-gl";
import { getColour } from "./colours";
import { dashSegments, readDrawingStyle } from "./drawingStyle";
import { landingCutColourBeforeLayer } from "./mapBasemapLayers";
import { cutAreasGeoJson, cutBuildingsGeoJson, cutColourMaskGeoJson } from "./mapCutGeoJson";
import { mapSiteLayerPaint, siteBoundaryGeoJson, siteBuildingsGeoJson } from "./mapSiteGeoJson";
import type { AreaFeat, BuildingFeat, LonLat, SiteFrameShape } from "../types";
import type { SiteParcel } from "./vicmapSiteParcel";

const BUILDINGS_SOURCE = "citycut-site-buildings";
const BOUNDARY_SOURCE = "citycut-site-boundary";
const BUILDINGS_LAYER = "citycut-site-buildings-fill";
const BOUNDARY_LAYER = "citycut-site-boundary-line";

const CUT_MASK_SOURCE = "citycut-cut-mask";
const CUT_WATER_SOURCE = "citycut-cut-water";
const CUT_GREEN_SOURCE = "citycut-cut-green";
const CUT_BUILDINGS_SOURCE = "citycut-cut-buildings";
const CUT_MASK_LAYER = "citycut-cut-mask-fill";
const CUT_WATER_LAYER = "citycut-cut-water-fill";
const CUT_GREEN_LAYER = "citycut-cut-green-fill";
const CUT_BUILDINGS_LAYER = "citycut-cut-buildings-fill";

export const CUT_COLOUR_SOURCE_IDS = [CUT_BUILDINGS_SOURCE, CUT_GREEN_SOURCE, CUT_WATER_SOURCE] as const;

export type CutColourMoveStats = {
  maskSetData: number;
  colourSetData: number;
  layerRebuilds: number;
};

declare global {
  interface Window {
    __citycutCutColourStats?: CutColourMoveStats;
  }
}

function qaStats(): CutColourMoveStats | null {
  if (typeof window === "undefined" || !window.location.search.includes("qa=1")) return null;
  if (!window.__citycutCutColourStats) {
    window.__citycutCutColourStats = { maskSetData: 0, colourSetData: 0, layerRebuilds: 0 };
  }
  return window.__citycutCutColourStats;
}

function bumpColourSetData(): void {
  const stats = qaStats();
  if (stats) stats.colourSetData += 1;
}

export function removeMapCutColourLayers(map: maplibregl.Map): void {
  for (const layer of [CUT_MASK_LAYER, CUT_BUILDINGS_LAYER, CUT_GREEN_LAYER, CUT_WATER_LAYER]) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  for (const source of [CUT_MASK_SOURCE, CUT_BUILDINGS_SOURCE, CUT_GREEN_SOURCE, CUT_WATER_SOURCE]) {
    if (map.getSource(source)) map.removeSource(source);
  }
}

function colourGeoJson(
  dataOrigin: LonLat,
  sideM: number,
  areas: AreaFeat[],
  buildings: BuildingFeat[],
): { water: GeoJSON.FeatureCollection; green: GeoJSON.FeatureCollection; buildings: GeoJSON.FeatureCollection } {
  const unclipped = { clipToFrame: false as const };
  const waterAreas = areas.filter((area) => area.kind === "water");
  const greenAreas = areas.filter((area) => area.kind === "green");
  return {
    water: cutAreasGeoJson(waterAreas, dataOrigin, sideM, "square", unclipped),
    green: cutAreasGeoJson(greenAreas, dataOrigin, sideM, "square", unclipped),
    buildings: cutBuildingsGeoJson(buildings, dataOrigin, sideM, "square", unclipped),
  };
}

/** Moves only the landuse mask with the cut frame (rAF-throttled from MapStage). */
export function updateMapCutColourMask(
  map: maplibregl.Map,
  options: { center: LonLat; sideM: number; frameShape: SiteFrameShape },
): void {
  if (!map.getSource(CUT_MASK_SOURCE)) return;
  const data = cutColourMaskGeoJson(options.center, options.sideM, options.frameShape);
  (map.getSource(CUT_MASK_SOURCE) as maplibregl.GeoJSONSource).setData(data);
  const stats = qaStats();
  if (stats) stats.maskSetData += 1;
}

/** Swap Overture fill data without rebuilding layers (viewport refetch). */
export function setMapCutColourData(
  map: maplibregl.Map,
  options: {
    dataOrigin: LonLat;
    sideM: number;
    areas: AreaFeat[];
    buildings: BuildingFeat[];
  },
): boolean {
  if (!map.getSource(CUT_BUILDINGS_SOURCE) && !map.getSource(CUT_WATER_SOURCE) && !map.getSource(CUT_GREEN_SOURCE)) {
    return false;
  }
  const { water, green, buildings } = colourGeoJson(options.dataOrigin, options.sideM, options.areas, options.buildings);
  const waterSource = map.getSource(CUT_WATER_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const greenSource = map.getSource(CUT_GREEN_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const buildingSource = map.getSource(CUT_BUILDINGS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (waterSource) {
    waterSource.setData(water);
    bumpColourSetData();
  }
  if (greenSource) {
    greenSource.setData(green);
    bumpColourSetData();
  }
  if (buildingSource) {
    buildingSource.setData(buildings);
    bumpColourSetData();
  }
  return true;
}

/** Thematic fills for the landing map; clipped by the mask below road layers (does not move the camera). */
export function updateMapCutColourLayers(
  map: maplibregl.Map,
  options: {
    dataOrigin: LonLat;
    dataSideM: number;
    maskCenter: LonLat;
    cutSideM: number;
    frameShape: SiteFrameShape;
    areas: AreaFeat[];
    buildings: BuildingFeat[];
  },
): void {
  removeMapCutColourLayers(map);
  const stats = qaStats();
  if (stats) stats.layerRebuilds += 1;
  const beforeId = landingCutColourBeforeLayer(map);
  const { water, green, buildings } = colourGeoJson(
    options.dataOrigin,
    options.dataSideM,
    options.areas,
    options.buildings,
  );

  if (water.features.length > 0) {
    map.addSource(CUT_WATER_SOURCE, { type: "geojson", data: water });
    map.addLayer(
      {
        id: CUT_WATER_LAYER,
        type: "fill",
        source: CUT_WATER_SOURCE,
        paint: { "fill-color": getColour("--water-fill"), "fill-opacity": 0.95 },
      },
      beforeId,
    );
  }
  if (green.features.length > 0) {
    map.addSource(CUT_GREEN_SOURCE, { type: "geojson", data: green });
    map.addLayer(
      {
        id: CUT_GREEN_LAYER,
        type: "fill",
        source: CUT_GREEN_SOURCE,
        paint: { "fill-color": getColour("--green-fill"), "fill-opacity": 0.92 },
      },
      beforeId,
    );
  }
  if (buildings.features.length > 0) {
    map.addSource(CUT_BUILDINGS_SOURCE, { type: "geojson", data: buildings });
    map.addLayer(
      {
        id: CUT_BUILDINGS_LAYER,
        type: "fill",
        source: CUT_BUILDINGS_SOURCE,
        paint: { "fill-color": ["get", "fill"], "fill-opacity": 0.94 },
      },
      beforeId,
    );
  }

  const mask = cutColourMaskGeoJson(options.maskCenter, options.cutSideM, options.frameShape);
  map.addSource(CUT_MASK_SOURCE, { type: "geojson", data: mask });
  map.addLayer(
    {
      id: CUT_MASK_LAYER,
      type: "fill",
      source: CUT_MASK_SOURCE,
      paint: { "fill-color": getColour("--landing-map-mask"), "fill-opacity": 1 },
    },
    beforeId,
  );
}

export function removeMapSiteLayers(map: maplibregl.Map): void {
  if (map.getLayer(BOUNDARY_LAYER)) map.removeLayer(BOUNDARY_LAYER);
  if (map.getLayer(BUILDINGS_LAYER)) map.removeLayer(BUILDINGS_LAYER);
  if (map.getSource(BOUNDARY_SOURCE)) map.removeSource(BOUNDARY_SOURCE);
  if (map.getSource(BUILDINGS_SOURCE)) map.removeSource(BUILDINGS_SOURCE);
}

export function updateMapSiteLayers(
  map: maplibregl.Map,
  options: {
    center: LonLat;
    buildings: BuildingFeat[];
    siteBuildingIds: number[];
    parcel: SiteParcel | null;
  },
): void {
  removeMapSiteLayers(map);
  const paint = mapSiteLayerPaint();
  const buildingCollection = siteBuildingsGeoJson(options.buildings, options.siteBuildingIds, options.center);
  if (buildingCollection.features.length > 0) {
    map.addSource(BUILDINGS_SOURCE, { type: "geojson", data: buildingCollection });
    map.addLayer({
      id: BUILDINGS_LAYER,
      type: "fill",
      source: BUILDINGS_SOURCE,
      paint: {
        "fill-color": paint.buildingFill,
        "fill-opacity": 0.92,
      },
    });
  }
  if (options.parcel) {
    const boundaryCollection = siteBoundaryGeoJson(options.parcel, options.center);
    if (boundaryCollection.features.length > 0) {
      map.addSource(BOUNDARY_SOURCE, { type: "geojson", data: boundaryCollection });
      const dash = dashSegments(readDrawingStyle().siteBoundary.dash);
      const dashArray = dash && dash.length >= 2 ? [dash[0]! * 3, dash[1]! * 3] : undefined;
      map.addLayer({
        id: BOUNDARY_LAYER,
        type: "line",
        source: BOUNDARY_SOURCE,
        paint: {
          "line-color": paint.boundaryColor,
          "line-width": 2.5,
          ...(dashArray ? { "line-dasharray": dashArray } : {}),
        },
      });
    }
  }
}
