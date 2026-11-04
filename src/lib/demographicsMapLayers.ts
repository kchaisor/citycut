import type maplibregl from "maplibre-gl";
import { getColour } from "./colours";
import { DEMOGRAPHICS_PARCELS_PMTILES_URL } from "./demographicsParcelsPmtiles";
import { ensurePmtilesProtocol, sharedPmtilesForAbsoluteUrl } from "./registerPmtilesProtocol";

export const DEMO_PARCELS_SOURCE = "citycut-demographics-parcels";
export const DEMO_PARCELS_FILL = "citycut-demographics-parcels-fill";
export const DEMO_PARCELS_LINE = "citycut-demographics-parcels-line";
export const DEMO_PARCELS_LAYER = "parcels";

const PARCEL_MIN_ZOOM = 11;
const PARCEL_MAX_ZOOM = 22;

export function demographicsParcelsPmtilesAbsoluteUrl(): string {
  return new URL(DEMOGRAPHICS_PARCELS_PMTILES_URL, window.location.href).href;
}

export function paintDemographicsParcelLayers(map: maplibregl.Map): void {
  if (!map.getLayer(DEMO_PARCELS_FILL)) return;
  map.setPaintProperty(DEMO_PARCELS_FILL, "fill-color", getColour("--demographics-parcel-outside"));
  map.setPaintProperty(DEMO_PARCELS_LINE, "line-color", getColour("--demographics-parcel-line"));
}

export function addDemographicsParcelLayers(map: maplibregl.Map): void {
  ensurePmtilesProtocol();
  const absolute = demographicsParcelsPmtilesAbsoluteUrl();
  sharedPmtilesForAbsoluteUrl(absolute);
  if (!map.getSource(DEMO_PARCELS_SOURCE)) {
    map.addSource(DEMO_PARCELS_SOURCE, {
      type: "vector",
      url: `pmtiles://${absolute}`,
      minzoom: PARCEL_MIN_ZOOM,
      maxzoom: 15,
    });
  }
  if (!map.getLayer(DEMO_PARCELS_FILL)) {
    map.addLayer({
      id: DEMO_PARCELS_FILL,
      type: "fill",
      source: DEMO_PARCELS_SOURCE,
      "source-layer": DEMO_PARCELS_LAYER,
      minzoom: PARCEL_MIN_ZOOM,
      maxzoom: PARCEL_MAX_ZOOM,
      paint: {
        "fill-color": getColour("--demographics-parcel-outside"),
        "fill-opacity": 0.92,
        "fill-antialias": true,
      },
    });
  }
  if (!map.getLayer(DEMO_PARCELS_LINE)) {
    map.addLayer({
      id: DEMO_PARCELS_LINE,
      type: "line",
      source: DEMO_PARCELS_SOURCE,
      "source-layer": DEMO_PARCELS_LAYER,
      minzoom: PARCEL_MIN_ZOOM,
      maxzoom: PARCEL_MAX_ZOOM,
      paint: {
        "line-color": getColour("--demographics-parcel-line"),
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.2, 14, 0.45, 16, 0.7],
      },
    });
  }
}

export function isDemographicsRoadLayerId(id: string): boolean {
  return /road|highway|street|bridge|tunnel|transport|path/i.test(id);
}
