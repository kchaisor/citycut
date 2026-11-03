export const DEMOGRAPHICS_AGE_BANDS = ["0-14", "15-24", "25-34", "35-49", "50-64", "65+"] as const;
export type DemographicsAgeBand = (typeof DEMOGRAPHICS_AGE_BANDS)[number];

export const DEMOGRAPHICS_HOUSEHOLD_TYPES = ["lone", "couple", "family", "group"] as const;
export type DemographicsHouseholdType = (typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number];

export const DEMOGRAPHICS_RENT_BINS = [
  "0-149",
  "150-249",
  "250-349",
  "350-449",
  "450-549",
  "550-649",
  "650+",
] as const;
export type DemographicsRentBin = (typeof DEMOGRAPHICS_RENT_BINS)[number];

export type DemographicsLonLatRing = [number, number][];

export type DemographicsSa1Unit = {
  code: string;
  areaKm2: number;
  ring: DemographicsLonLatRing;
  population: number;
  age: Record<DemographicsAgeBand, number>;
  ageMale?: Record<DemographicsAgeBand, number>;
  ageFemale?: Record<DemographicsAgeBand, number>;
  households: Record<DemographicsHouseholdType, number>;
  medianAge?: number | null;
  apartmentShare?: number | null;
  rentingShare?: number | null;
  rentMedianWeekly?: number | null;
  rentBins?: Record<DemographicsRentBin, number>;
};

export type DemographicsBenchmark = {
  population: number;
  age: Record<DemographicsAgeBand, number>;
  ageMale?: Record<DemographicsAgeBand, number>;
  ageFemale?: Record<DemographicsAgeBand, number>;
  households: Record<DemographicsHouseholdType, number>;
  medianAge?: number | null;
  apartmentShare?: number | null;
  rentingShare?: number | null;
  rentMedianWeekly?: number | null;
  rentBins?: Record<DemographicsRentBin, number>;
};

export type DemographicsDataset = {
  version: number;
  gccsa: "2GMEL";
  licence: "CC BY 4.0";
  source: "ABS Census 2021 General Community Profile (SA1)";
  bbox: { west: number; south: number; east: number; north: number };
  benchmark: DemographicsBenchmark;
  units: DemographicsSa1Unit[];
};

export type DemographicsCutStats = {
  population: number;
  densityPerKm2: number;
  canopyPct: number;
  age: Record<DemographicsAgeBand, number>;
  households: Record<DemographicsHouseholdType, number>;
  sa1Cells: number;
};

export type DemographicsTab =
  | "people"
  | "age"
  | "households"
  | "dwellings"
  | "tenure"
  | "costs";
