export const DEMOGRAPHICS_AGE_BANDS = ["0-14", "15-24", "25-34", "35-49", "50-64", "65+"] as const;
export type DemographicsAgeBand = (typeof DEMOGRAPHICS_AGE_BANDS)[number];

export const DEMOGRAPHICS_HOUSEHOLD_TYPES = ["lone", "couple", "family", "group"] as const;
export type DemographicsHouseholdType = (typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number];

export type DemographicsLonLatRing = [number, number][];

export type DemographicsSa1Unit = {
  code: string;
  areaKm2: number;
  ring: DemographicsLonLatRing;
  population: number;
  age: Record<DemographicsAgeBand, number>;
  households: Record<DemographicsHouseholdType, number>;
};

export type DemographicsBenchmark = {
  population: number;
  age: Record<DemographicsAgeBand, number>;
  households: Record<DemographicsHouseholdType, number>;
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

export type DemographicsTab = "people" | "age" | "households" | "catchment";
