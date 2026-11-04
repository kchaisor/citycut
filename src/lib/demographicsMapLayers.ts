import type maplibregl from "maplibre-gl";
import { getColour } from "./colours";
import { DEMOGRAPHICS_PARCELS_PMTILES_URL } from "./demographicsParcelsPmtiles";
import { ensurePmtilesProtocol, sharedPmtilesForAbsoluteUrl } from "./registerPmtilesProtocol";

export const DEMO_PARCELS_SOURCE = "citycut-demographics-parcels";
export const DEMO_PARCELS_FILL = "citycut-demographics-parcels-fill";
export const DEMO_PARCELS_LINE = "citycut-demographics-parcels-line";
export const DEMO_PARCELS_LAYER = "parcels";

export function demographicsParcelsPmtilesAbsoluteUrl(): string {
  return new URL(DEMOGRAPHICS_PARCELS_PMTILES_URL, window.location.href).href;
}

export function addDemographicsParcelLayers(map: maplibregl.Map): void {
  ensurePmtilesProtocol();
  const absolute = demographicsParcelsPmtilesAbsoluteUrl();
  sharedPmtilesForAbsoluteUrl(absolute);
  if (!map.getSource(DEMO_PARCELS_SOURCE)) {
    map.addSource(DEMO_PARCELS_SOURCE, {
      type: "vector",
      url: `pmtiles://${absolute}`,
    });
  }
  if (!map.getLayer(DEMO_PARCELS_FILL)) {
    map.addLayer({
      id: DEMO_PARCELS_FILL,
      type: "fill",
      source: DEMO_PARCELS_SOURCE,
      "source-layer": DEMO_PARCELS_LAYER,
      paint: {
        "fill-color": getColour("--demographics-parcel-outside"),
        "fill-opacity": 0.92,
      },
    });
  }
  if (!map.getLayer(DEMO_PARCELS_LINE)) {
    map.addLayer({
      id: DEMO_PARCELS_LINE,
      type: "line",
      source: DEMO_PARCELS_SOURCE,
      "source-layer": DEMO_PARCELS_LAYER,
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
