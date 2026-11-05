import type maplibregl from "maplibre-gl";
import { getColour } from "./colours";
import { circleRingLonLat } from "./haversine";
import type { LonLat } from "../types";
import type { DemographicsPinId } from "./demographicsExplorerReducer";
import { DEMO_CATCHMENT_FILL, DEMO_CATCHMENT_SOURCE } from "./demographicsCatchmentGeoJson";

export const DEMO_PIN_SOURCE_A = "citycut-demographics-pin-a";
export const DEMO_PIN_SOURCE_B = "citycut-demographics-pin-b";
export const DEMO_CIRCLE_SOURCE_A = "citycut-demographics-circle-a";
export const DEMO_CIRCLE_SOURCE_B = "citycut-demographics-circle-b";
export const DEMO_PIN_LAYER_A = "citycut-demographics-pin-a-layer";
export const DEMO_PIN_LAYER_B = "citycut-demographics-pin-b-layer";
export const DEMO_CIRCLE_LAYER_A = "citycut-demographics-circle-a-layer";
export const DEMO_CIRCLE_LAYER_B = "citycut-demographics-circle-b-layer";

function emptyPoint(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function emptyPolygon(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function ensureDemographicsOverlaySources(map: maplibregl.Map): void {
  const addGeo = (id: string, data: GeoJSON.FeatureCollection) => {
    if (!map.getSource(id)) {
      map.addSource(id, { type: "geojson", data });
    }
  };
  addGeo(DEMO_CATCHMENT_SOURCE, emptyPolygon());
  addGeo(DEMO_PIN_SOURCE_A, emptyPoint());
  addGeo(DEMO_PIN_SOURCE_B, emptyPoint());
  addGeo(DEMO_CIRCLE_SOURCE_A, emptyPolygon());
  addGeo(DEMO_CIRCLE_SOURCE_B, emptyPolygon());
}

export function ensureDemographicsOverlayLayers(map: maplibregl.Map): void {
  ensureDemographicsOverlaySources(map);
  const pinColour = (pin: DemographicsPinId) =>
    getColour(pin === "a" ? "--demographics-pin-a" : "--demographics-pin-b");
  const addCircle = (sourceId: string, layerId: string, pin: DemographicsPinId) => {
    if (map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": pinColour(pin),
        "line-width": 2.4,
        "line-dasharray": [2, 1.4],
        "line-opacity": 0.95,
      },
    });
  };
  const addPin = (sourceId: string, layerId: string, pin: DemographicsPinId) => {
    if (map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 14,
        "circle-color": pinColour(pin),
        "circle-stroke-width": 1.2,
        "circle-stroke-color": getColour("--demographics-panel-text"),
      },
    });
  };
  if (!map.getLayer(DEMO_CATCHMENT_FILL)) {
    map.addLayer({
      id: DEMO_CATCHMENT_FILL,
      type: "fill",
      source: DEMO_CATCHMENT_SOURCE,
      paint: {
        "fill-color": ["get", "fill"],
        "fill-opacity": 0.88,
        "fill-antialias": true,
      },
    });
  }
  addCircle(DEMO_CIRCLE_SOURCE_A, DEMO_CIRCLE_LAYER_A, "a");
  addCircle(DEMO_CIRCLE_SOURCE_B, DEMO_CIRCLE_LAYER_B, "b");
  addPin(DEMO_PIN_SOURCE_A, DEMO_PIN_LAYER_A, "a");
  addPin(DEMO_PIN_SOURCE_B, DEMO_PIN_LAYER_B, "b");
}

export function updateDemographicsCatchmentFill(
  map: maplibregl.Map,
  data: GeoJSON.FeatureCollection,
): void {
  const src = map.getSource(DEMO_CATCHMENT_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
}

export function updateDemographicsPinOverlay(
  map: maplibregl.Map,
  pinId: DemographicsPinId,
  position: LonLat | null,
  radiusM: number,
): void {
  const pinSource = pinId === "a" ? DEMO_PIN_SOURCE_A : DEMO_PIN_SOURCE_B;
  const circleSource = pinId === "a" ? DEMO_CIRCLE_SOURCE_A : DEMO_CIRCLE_SOURCE_B;
  const pinSrc = map.getSource(pinSource) as maplibregl.GeoJSONSource | undefined;
  const circleSrc = map.getSource(circleSource) as maplibregl.GeoJSONSource | undefined;
  if (!pinSrc || !circleSrc) return;
  if (!position) {
    pinSrc.setData(emptyPoint());
    circleSrc.setData(emptyPolygon());
    return;
  }
  pinSrc.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { pin: pinId },
        geometry: { type: "Point", coordinates: [position.lon, position.lat] },
      },
    ],
  });
  circleSrc.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [circleRingLonLat(position, radiusM)],
        },
      },
    ],
  });
}
