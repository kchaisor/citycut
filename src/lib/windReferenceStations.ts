export type WindReferenceStationRule = {
  stationId: string;
  label: string;
  centre: { lat: number; lon: number };
  radiusKm: number;
  reason: string;
  skippedReason: string;
};

// Pyrmont and Blackwattle Bay pedestrian wind studies (Windtech WD758-22F01, June 2022; Windtech WD758-25F02,
// Nov 2023; CPP Project 9079, Jan 2020; CPP City of Sydney Project 7224, June 2013) all use the Sydney Airport
// anemometer as the regional wind climate for harbour sites.
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
