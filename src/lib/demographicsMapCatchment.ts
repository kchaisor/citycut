import type maplibregl from "maplibre-gl";
import { getColour } from "./colours";
import { colourForMetric } from "./demographicsDensityColour";
import { parcelColourMetric, type DemographicsParcelRecord } from "./demographicsParcels";
import {
  DEMO_PARCELS_SOURCE,
  DEMO_PARCELS_LAYER,
} from "./demographicsMapLayers";
import type { DemographicsColourBy } from "./demographicsExplorerReducer";
import type { DemographicsPinId } from "./demographicsExplorerReducer";

export type CatchmentPaintState = {
  a: Set<string>;
  b: Set<string>;
};

export function catchmentPaintFillColour(
  parcel: DemographicsParcelRecord,
  colourBy: DemographicsColourBy,
): string {
  return colourForMetric(parcelColourMetric(parcel, colourBy), colourBy);
}

export function syncDemographicsCatchmentFeatureState(
  map: maplibregl.Map,
  previous: CatchmentPaintState,
  next: CatchmentPaintState,
  parcelsById: Map<string, DemographicsParcelRecord>,
  colourBy: DemographicsColourBy,
): CatchmentPaintState {
  if (!map.getSource(DEMO_PARCELS_SOURCE)) return next;
  const clearIds = new Set<string>([...previous.a, ...previous.b]);
  for (const id of next.a) clearIds.delete(id);
  for (const id of next.b) clearIds.delete(id);
  for (const id of clearIds) {
    try {
      map.removeFeatureState({ source: DEMO_PARCELS_SOURCE, sourceLayer: DEMO_PARCELS_LAYER, id });
    } catch {
    }
  }
  const featureIds = (parcelId: string): (string | number)[] => {
    const ids: (string | number)[] = [parcelId];
    const numeric = Number(parcelId);
    if (Number.isFinite(numeric) && String(numeric) === parcelId.trim()) ids.push(numeric);
    return ids;
  };
  const apply = (id: string, pin: DemographicsPinId) => {
    const parcel = parcelsById.get(id);
    if (!parcel) return;
    const payload = {
      inCatchment: true,
      catchmentPin: pin,
      fillColour: catchmentPaintFillColour(parcel, colourBy),
    };
    for (const featureId of featureIds(id)) {
      try {
        map.setFeatureState(
          { source: DEMO_PARCELS_SOURCE, sourceLayer: DEMO_PARCELS_LAYER, id: featureId },
          payload,
        );
      } catch {
      }
    }
  };
  for (const id of next.a) {
    if (!previous.a.has(id)) apply(id, "a");
  }
  for (const id of next.b) {
    if (!previous.b.has(id)) apply(id, "b");
  }
  for (const id of next.a) {
    if (previous.a.has(id)) {
      const parcel = parcelsById.get(id);
      if (parcel) {
        map.setFeatureState(
          { source: DEMO_PARCELS_SOURCE, sourceLayer: DEMO_PARCELS_LAYER, id },
          { fillColour: catchmentPaintFillColour(parcel, colourBy) },
        );
      }
    }
  }
  for (const id of next.b) {
    if (previous.b.has(id)) {
      const parcel = parcelsById.get(id);
      if (parcel) {
        map.setFeatureState(
          { source: DEMO_PARCELS_SOURCE, sourceLayer: DEMO_PARCELS_LAYER, id },
          { fillColour: catchmentPaintFillColour(parcel, colourBy) },
        );
      }
    }
  }
  return { a: new Set(next.a), b: new Set(next.b) };
}

export function demographicsCatchmentFillPaint(): maplibregl.DataDrivenPropertyValueSpecification<string> {
  return [
    "case",
    ["boolean", ["feature-state", "inCatchment"], false],
    ["coalesce", ["feature-state", "fillColour"], getColour("--demographics-parcel-outside")],
    getColour("--demographics-parcel-outside"),
  ];
}
