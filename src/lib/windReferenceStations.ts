export type WindReferenceStationRule = {
  stationId: string;
  label: string;
  centre: { lat: number; lon: number };
  radiusKm: number;
  reason: string;
  skippedReason: string;
};

export const WIND_REFERENCE_STATION_RULES: readonly WindReferenceStationRule[] = [
  {
    stationId: "947670",
    label: "Sydney Harbour",
    centre: { lat: -33.8546, lon: 151.2257 },
    radiusKm: 12,
    reason: "Harbour site: wind consultants use Sydney Airport's open, exposed record",
    skippedReason: "harbour site: Sydney Airport preferred",
  },
];
