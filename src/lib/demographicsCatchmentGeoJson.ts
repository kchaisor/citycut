import type { DemographicsColourBy } from "./demographicsExplorerReducer";
import type { DemographicsParcelRecord } from "./demographicsParcels";
import { catchmentPaintFillColour } from "./demographicsMapCatchment";

export const DEMO_CATCHMENT_SOURCE = "citycut-demographics-catchment";
export const DEMO_CATCHMENT_FILL = "citycut-demographics-catchment-fill";

export function catchmentParcelsGeoJson(
  parcels: DemographicsParcelRecord[],
  colourBy: DemographicsColourBy,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parcels.map((parcel) => ({
      type: "Feature",
      properties: {
        fill: catchmentPaintFillColour(parcel, colourBy),
        parcelId: parcel.id,
      },
      geometry: {
        type: "Polygon",
        coordinates: [parcel.ring],
      },
    })),
  };
}
