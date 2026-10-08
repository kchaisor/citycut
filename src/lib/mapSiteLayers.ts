import type maplibregl from "maplibre-gl";
import { getColour } from "./colours";
import { dashSegments, readDrawingStyle } from "./drawingStyle";
import { landingCutBuildingsBeforeLayer } from "./mapBasemapLayers";
import { cutBuildingsGeoJson, cutColourMaskGeoJson } from "./mapCutGeoJson";
import { mapSiteLayerPaint, siteBoundaryGeoJson, siteBuildingsGeoJson } from "./mapSiteGeoJson";
import type { BuildingFeat, LonLat, SiteFrameShape } from "../types";
import type { SiteParcel } from "./vicmapSiteParcel";

const BUILDINGS_SOURCE = "citycut-site-buildings";
const BOUNDARY_SOURCE = "citycut-site-boundary";
const BUILDINGS_LAYER = "citycut-site-buildings-fill";
const BOUNDARY_LAYER = "citycut-site-boundary-line";

const CUT_MASK_SOURCE = "citycut-cut-mask";
const CUT_BUILDINGS_SOURCE = "citycut-cut-buildings";
const CUT_MASK_BUILDINGS_LAYER = "citycut-cut-mask-buildings-fill";
const CUT_BUILDINGS_LAYER = "citycut-cut-buildings-fill";

export const CUT_COLOUR_SOURCE_IDS = [CUT_BUILDINGS_SOURCE] as const;

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
  for (const layer of [CUT_MASK_BUILDINGS_LAYER, CUT_BUILDINGS_LAYER]) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  for (const source of [CUT_MASK_SOURCE, CUT_BUILDINGS_SOURCE]) {
    if (map.getSource(source)) map.removeSource(source);
  }
}

function buildingsGeoJson(dataOrigin: LonLat, sideM: number, buildings: BuildingFeat[]): GeoJSON.FeatureCollection {
  return cutBuildingsGeoJson(buildings, dataOrigin, sideM, "square", { clipToFrame: false });
}

/** Moves the shared mask GeoJSON (rAF-throttled in MapStage while the frame is dragged). */
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

/** Swap Overture building fill data without rebuilding layers (viewport refetch). */
export function setMapCutColourData(
  map: maplibregl.Map,
  options: {
    dataOrigin: LonLat;
    sideM: number;
    buildings: BuildingFeat[];
  },
): boolean {
  if (!map.getSource(CUT_BUILDINGS_SOURCE)) {
    return false;
  }
  const buildings = buildingsGeoJson(options.dataOrigin, options.sideM, options.buildings);
  const buildingSource = map.getSource(CUT_BUILDINGS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (buildingSource) {
    buildingSource.setData(buildings);
    bumpColourSetData();
  }
  return true;
}

/** Use-coloured building preview on the landing map; clipped to the cut frame by the shared mask. */
export function updateMapCutColourLayers(
  map: maplibregl.Map,
  options: {
    dataOrigin: LonLat;
    dataSideM: number;
    maskCenter: LonLat;
    cutSideM: number;
    frameShape: SiteFrameShape;
    buildings: BuildingFeat[];
  },
): void {
  removeMapCutColourLayers(map);
  const stats = qaStats();
  if (stats) stats.layerRebuilds += 1;
  const buildingsBefore = landingCutBuildingsBeforeLayer(map);
  const buildings = buildingsGeoJson(options.dataOrigin, options.dataSideM, options.buildings);

  const mask = cutColourMaskGeoJson(options.maskCenter, options.cutSideM, options.frameShape);
  map.addSource(CUT_MASK_SOURCE, { type: "geojson", data: mask });

  if (buildings.features.length > 0) {
    map.addSource(CUT_BUILDINGS_SOURCE, { type: "geojson", data: buildings });
    map.addLayer(
      {
        id: CUT_BUILDINGS_LAYER,
        type: "fill",
        source: CUT_BUILDINGS_SOURCE,
        paint: { "fill-color": ["get", "fill"], "fill-opacity": 0.94 },
      },
      buildingsBefore,
    );
    map.addLayer(
      {
        id: CUT_MASK_BUILDINGS_LAYER,
        type: "fill",
        source: CUT_MASK_SOURCE,
        paint: { "fill-color": getColour("--landing-building-mask"), "fill-opacity": 1 },
      },
      buildingsBefore,
    );
  }
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
