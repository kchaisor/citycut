import { fromLocal, toLocal } from "./geo";
import type { LonLat } from "../types";
import {
  DEMOGRAPHICS_AGE_BANDS,
  DEMOGRAPHICS_HOUSEHOLD_TYPES,
  DEMOGRAPHICS_RENT_BINS,
  type DemographicsAgeBand,
  type DemographicsBenchmark,
  type DemographicsRentBin,
  type DemographicsSa1Unit,
} from "./demographicsTypes";
import type { DemographicsSpatialIndex } from "./demographicsClip";
import { aggregateDemographicsForCircle, type DemographicsParcelRecord } from "./demographicsParcels";

export type DemographicsCatchmentStats = {
  population: number;
  densityPerHa: number;
  parcelCount: number;
  sa1Count: number;
  medianAge: number | null;
  ageMale: Record<DemographicsAgeBand, number>;
  ageFemale: Record<DemographicsAgeBand, number>;
  households: Record<(typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number], number>;
  apartmentShare: number | null;
  rentingShare: number | null;
  rentBins: Record<DemographicsRentBin, number>;
  rentMedianWeekly: number | null;
  enoughData: boolean;
};

function emptyAge(): Record<DemographicsAgeBand, number> {
  return Object.fromEntries(DEMOGRAPHICS_AGE_BANDS.map((band) => [band, 0])) as Record<
    DemographicsAgeBand,
    number
  >;
}

function emptyRent(): Record<DemographicsRentBin, number> {
  return Object.fromEntries(DEMOGRAPHICS_RENT_BINS.map((bin) => [bin, 0])) as Record<
    DemographicsRentBin,
    number
  >;
}

export function aggregateCatchmentFromSa1(input: {
  index: DemographicsSpatialIndex;
  units: DemographicsSa1Unit[];
  center: LonLat;
  east: number;
  north: number;
  radiusM: number;
}): DemographicsCatchmentStats | null {
  const pinLonLat = fromLocal([input.east, input.north], input.center);
  const circle = aggregateDemographicsForCircle({
    index: input.index,
    center: input.center,
    pin: pinLonLat,
    radiusM: input.radiusM,
  });
  if (!circle) return null;
  return {
    population: Math.round(circle.population),
    densityPerHa: Math.round(circle.densityPerHa),
    parcelCount: 0,
    sa1Count: circle.sa1Cells,
    medianAge: circle.medianAge,
    ageMale: circle.ageMale,
    ageFemale: circle.ageFemale,
    households: circle.households,
    apartmentShare: circle.apartmentShare,
    rentingShare: circle.rentingShare,
    rentBins: circle.rentBins,
    rentMedianWeekly:
      circle.rentMedianWeekly != null ? Math.round(circle.rentMedianWeekly) : null,
    enoughData: circle.population >= 1,
  };
}

export function aggregateCatchmentFromParcels(input: {
  parcels: DemographicsParcelRecord[];
  center: LonLat;
  east: number;
  north: number;
  radiusM: number;
}): DemographicsCatchmentStats | null {
  const r2 = input.radiusM * input.radiusM;
  let population = 0;
  let parcelCount = 0;
  const sa1Codes = new Set<string>();
  const ageMale = emptyAge();
  const ageFemale = emptyAge();
  const households = Object.fromEntries(DEMOGRAPHICS_HOUSEHOLD_TYPES.map((k) => [k, 0])) as Record<
    (typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number],
    number
  >;
  const rentBins = emptyRent();
  let rentWeighted = 0;
  let rentWeight = 0;
  let apartmentWeighted = 0;
  let rentingWeighted = 0;
  let ageWeighted = 0;
  let ageWeight = 0;

  for (const parcel of input.parcels) {
    const [px, py] = toLocal(parcel.centroidLat, parcel.centroidLon, input.center);
    const dx = px - input.east;
    const dy = py - input.north;
    if (dx * dx + dy * dy > r2) continue;
    parcelCount += 1;
    sa1Codes.add(parcel.sa1Code);
    population += parcel.residents;
    for (const band of DEMOGRAPHICS_AGE_BANDS) {
      ageMale[band] += parcel.ageMale[band];
      ageFemale[band] += parcel.ageFemale[band];
    }
    for (const kind of DEMOGRAPHICS_HOUSEHOLD_TYPES) {
      households[kind] += parcel.households[kind];
    }
    for (const bin of DEMOGRAPHICS_RENT_BINS) {
      rentBins[bin] += parcel.rentBins[bin];
    }
    if (parcel.rentMedianWeekly != null && parcel.residents > 0) {
      rentWeighted += parcel.rentMedianWeekly * parcel.residents;
      rentWeight += parcel.residents;
    }
    if (parcel.apartmentShare != null && parcel.residents > 0) {
      apartmentWeighted += parcel.apartmentShare * parcel.residents;
    }
    if (parcel.rentingShare != null && parcel.residents > 0) {
      rentingWeighted += parcel.rentingShare * parcel.residents;
    }
    if (parcel.medianAge != null && parcel.residents > 0) {
      ageWeighted += parcel.medianAge * parcel.residents;
      ageWeight += parcel.residents;
    }
  }

  if (parcelCount === 0) return null;
  const areaHa = (Math.PI * input.radiusM * input.radiusM) / 10_000;
  return {
    population: Math.round(population),
    densityPerHa: areaHa > 0 ? Math.round(population / areaHa) : 0,
    parcelCount,
    sa1Count: sa1Codes.size,
    medianAge: ageWeight > 0 ? Math.round((ageWeighted / ageWeight) * 10) / 10 : null,
    ageMale,
    ageFemale,
    households,
    apartmentShare:
      population > 0 ? Math.round((apartmentWeighted / population) * 10) / 10 : null,
    rentingShare:
      population > 0 ? Math.round((rentingWeighted / population) * 10) / 10 : null,
    rentBins,
    rentMedianWeekly: rentWeight > 0 ? Math.round(rentWeighted / rentWeight) : null,
    enoughData: population >= 1,
  };
}

function sa1HasDetail(stats: DemographicsCatchmentStats): boolean {
  const ageTotal = DEMOGRAPHICS_AGE_BANDS.reduce(
    (sum, band) => sum + stats.ageMale[band] + stats.ageFemale[band],
    0,
  );
  return ageTotal > 0;
}

export function aggregateCatchmentForPin(input: {
  parcels: DemographicsParcelRecord[];
  center: LonLat;
  east: number;
  north: number;
  radiusM: number;
  index: DemographicsSpatialIndex;
}): DemographicsCatchmentStats | null {
  const fromParcels = aggregateCatchmentFromParcels({
    parcels: input.parcels,
    center: input.center,
    east: input.east,
    north: input.north,
    radiusM: input.radiusM,
  });
  const fromSa1 = aggregateCatchmentFromSa1({
    index: input.index,
    units: [],
    center: input.center,
    east: input.east,
    north: input.north,
    radiusM: input.radiusM,
  });
  if (fromSa1 && fromParcels) {
    const useParcelPop = fromParcels.population >= 25;
    return {
      ...fromSa1,
      population: useParcelPop ? fromParcels.population : fromSa1.population,
      densityPerHa: useParcelPop ? fromParcels.densityPerHa : fromSa1.densityPerHa,
      parcelCount: fromParcels.parcelCount,
      sa1Count: Math.max(fromSa1.sa1Count, fromParcels.sa1Count),
      enoughData: fromSa1.population >= 1 || fromParcels.population >= 1,
    };
  }
  if (fromSa1) {
    return {
      ...fromSa1,
      parcelCount: fromParcels?.parcelCount ?? 0,
      enoughData: fromSa1.population >= 1,
    };
  }
  if (fromParcels && (fromParcels.population >= 1 || sa1HasDetail(fromParcels))) {
    return fromParcels;
  }
  return fromParcels?.parcelCount ? { ...fromParcels, enoughData: false } : null;
}

export function compareGlance(
  a: DemographicsCatchmentStats,
  b: DemographicsCatchmentStats,
): {
  residentsPct: number;
  medianAgeA: number | null;
  medianAgeB: number | null;
  rentersPts: number | null;
  rentDelta: number | null;
} {
  const residentsPct =
    a.population > 0 ? Math.round(((b.population - a.population) / a.population) * 100) : 0;
  const rentersPts =
    a.rentingShare != null && b.rentingShare != null
      ? Math.round((b.rentingShare - a.rentingShare) * 10) / 10
      : null;
  const rentDelta =
    a.rentMedianWeekly != null && b.rentMedianWeekly != null
      ? b.rentMedianWeekly - a.rentMedianWeekly
      : null;
  return {
    residentsPct,
    medianAgeA: a.medianAge,
    medianAgeB: b.medianAge,
    rentersPts,
    rentDelta,
  };
}

export function benchmarkAgePyramid(benchmark: DemographicsBenchmark): {
  male: Record<DemographicsAgeBand, number>;
  female: Record<DemographicsAgeBand, number>;
} {
  const male = emptyAge();
  const female = emptyAge();
  const pop = benchmark.population;
  if (pop <= 0) return { male, female };
  for (const band of DEMOGRAPHICS_AGE_BANDS) {
    const total = benchmark.age[band] ?? 0;
    const m = benchmark.ageMale?.[band] ?? total * 0.49;
    const f = benchmark.ageFemale?.[band] ?? total - m;
    male[band] = (m / pop) * 100;
    female[band] = (f / pop) * 100;
  }
  return { male, female };
}
