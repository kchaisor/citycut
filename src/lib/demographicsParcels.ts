import RBush from "rbush";
import { intersectionAreaM2 } from "./comBuildingHeightsMatch";
import { M_PER_DEG_LAT, mPerDegLon, signedArea, toLocal } from "./geo";
import type { LonLat, Pt, Ring } from "../types";
import {
  DEMOGRAPHICS_AGE_BANDS,
  DEMOGRAPHICS_HOUSEHOLD_TYPES,
  DEMOGRAPHICS_RENT_BINS,
  type DemographicsAgeBand,
  type DemographicsRentBin,
  type DemographicsSa1Unit,
} from "./demographicsTypes";
import type { DemographicsSpatialIndex } from "./demographicsClip";

export type DemographicsParcelRecord = {
  id: string;
  sa1Code: string;
  centroidLon: number;
  centroidLat: number;
  ring: [number, number][];
  areaM2: number;
  residents: number;
  medianAge: number | null;
  ageMale: Record<DemographicsAgeBand, number>;
  ageFemale: Record<DemographicsAgeBand, number>;
  households: Record<(typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number], number>;
  apartmentShare: number | null;
  rentingShare: number | null;
  rentBins: Record<DemographicsRentBin, number>;
  rentMedianWeekly: number | null;
};

type IndexedParcel = DemographicsParcelRecord & {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type DemographicsParcelIndex = RBush<IndexedParcel>;

export type DemographicsParcelsDataset = {
  version: number;
  bbox: { west: number; south: number; east: number; north: number };
  parcels: DemographicsParcelRecord[];
};

export function buildParcelIndex(parcels: DemographicsParcelRecord[], origin: LonLat): DemographicsParcelIndex {
  const tree = new RBush<IndexedParcel>();
  tree.load(
    parcels.map((parcel) => {
      const [cx, cy] = toLocal(parcel.centroidLat, parcel.centroidLon, origin);
      return {
        ...parcel,
        minX: cx,
        minY: cy,
        maxX: cx,
        maxY: cy,
      };
    }),
  );
  return tree;
}

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

function emptyHouseholds(): Record<(typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number], number> {
  return Object.fromEntries(DEMOGRAPHICS_HOUSEHOLD_TYPES.map((kind) => [kind, 0])) as Record<
    (typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number],
    number
  >;
}

function sa1AreaM2(unit: DemographicsSa1Unit, origin: LonLat): number {
  const fromAttr = unit.areaKm2 * 1_000_000;
  if (fromAttr > 0) return fromAttr;
  const local = unit.ring.map(([lon, lat]) => toLocal(lat, lon, origin));
  return Math.abs(signedArea(local));
}

function lonLatRingToLocal(ring: DemographicsSa1Unit["ring"], origin: LonLat): Ring {
  return ring.map(([lon, lat]) => toLocal(lat, lon, origin));
}

export function aggregateDemographicsForCircle(input: {
  index: DemographicsSpatialIndex;
  center: LonLat;
  pin: LonLat;
  radiusM: number;
}): {
  population: number;
  densityPerHa: number;
  sa1Cells: number;
  medianAge: number | null;
  ageMale: Record<DemographicsAgeBand, number>;
  ageFemale: Record<DemographicsAgeBand, number>;
  households: Record<(typeof DEMOGRAPHICS_HOUSEHOLD_TYPES)[number], number>;
  apartmentShare: number | null;
  rentingShare: number | null;
  rentBins: Record<DemographicsRentBin, number>;
  rentMedianWeekly: number | null;
} | null {
  const dLon = input.radiusM / mPerDegLon(input.center.lat);
  const dLat = input.radiusM / M_PER_DEG_LAT;
  const hits = input.index.search({
    minX: input.pin.lon - dLon,
    minY: input.pin.lat - dLat,
    maxX: input.pin.lon + dLon,
    maxY: input.pin.lat + dLat,
  });

  const [pinX, pinY] = toLocal(input.pin.lat, input.pin.lon, input.center);
  const r2 = input.radiusM * input.radiusM;

  let population = 0;
  let sa1Cells = 0;
  const ageMale = emptyAge();
  const ageFemale = emptyAge();
  const households = emptyHouseholds();
  const rentBins = emptyRent();
  let apartmentWeighted = 0;
  let rentingWeighted = 0;
  let rentWeighted = 0;
  let rentWeight = 0;
  let ageWeighted = 0;
  let ageWeight = 0;

  for (const unit of hits) {
    const localRing = lonLatRingToLocal(unit.ring, input.center);
    const sa1M2 = sa1AreaM2(unit, input.center);
    if (sa1M2 <= 0) continue;

    const centroid = localRing.reduce(
      (acc, pt) => [acc[0] + pt[0], acc[1] + pt[1]] as Pt,
      [0, 0] as Pt,
    );
    const cx = centroid[0] / localRing.length;
    const cy = centroid[1] / localRing.length;
    const dx = cx - pinX;
    const dy = cy - pinY;
    const centroidInside = dx * dx + dy * dy <= r2;
    const circlePoly = {
      ring: approximateCircleRing(pinX, pinY, input.radiusM),
      holes: [] as Ring[],
    };
    const sa1Poly = { ring: localRing, holes: [] as Ring[] };
    const overlap = intersectionAreaM2(sa1Poly, circlePoly);
    const insideFraction = centroidInside ? Math.min(1, overlap / sa1M2) : overlap / sa1M2;
    if (insideFraction <= 0) continue;

    sa1Cells += 1;
    const popPart = unit.population * insideFraction;
    population += popPart;
    for (const band of DEMOGRAPHICS_AGE_BANDS) {
      ageMale[band] += (unit.ageMale?.[band] ?? unit.age[band] * 0.49) * insideFraction;
      ageFemale[band] += (unit.ageFemale?.[band] ?? unit.age[band] * 0.51) * insideFraction;
    }
    for (const kind of DEMOGRAPHICS_HOUSEHOLD_TYPES) {
      households[kind] += unit.households[kind] * insideFraction;
    }
    for (const bin of DEMOGRAPHICS_RENT_BINS) {
      rentBins[bin] += (unit.rentBins?.[bin] ?? 0) * insideFraction;
    }
    if (unit.medianAge != null) {
      ageWeighted += unit.medianAge * popPart;
      ageWeight += popPart;
    }
    if (unit.apartmentShare != null) apartmentWeighted += unit.apartmentShare * popPart;
    if (unit.rentingShare != null) rentingWeighted += unit.rentingShare * popPart;
    if (unit.rentMedianWeekly != null) {
      rentWeighted += unit.rentMedianWeekly * popPart;
      rentWeight += popPart;
    }
  }

  if (population <= 0) return null;
  const areaHa = (Math.PI * input.radiusM * input.radiusM) / 10_000;
  return {
    population,
    densityPerHa: areaHa > 0 ? population / areaHa : 0,
    sa1Cells,
    medianAge: ageWeight > 0 ? ageWeighted / ageWeight : null,
    ageMale,
    ageFemale,
    households,
    apartmentShare: population > 0 ? apartmentWeighted / population : null,
    rentingShare: population > 0 ? rentingWeighted / population : null,
    rentBins,
    rentMedianWeekly: rentWeight > 0 ? rentWeighted / rentWeight : null,
  };
}

export function parcelColourMetric(
  parcel: DemographicsParcelRecord,
  colourBy: "density" | "medianAge" | "rent" | "rentersPct",
): number | null {
  const ha = parcel.areaM2 / 10_000;
  switch (colourBy) {
    case "density":
      return ha > 0 ? parcel.residents / ha : null;
    case "medianAge":
      return parcel.medianAge;
    case "rent":
      return parcel.rentMedianWeekly;
    case "rentersPct":
      return parcel.rentingShare;
    default:
      return null;
  }
}

export function densityRampStops(): number[] {
  return [0, 20, 40, 80, 120, 160];
}

function approximateCircleRing(cx: number, cy: number, radiusM: number, segments = 32): Ring {
  const ring: Ring = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    ring.push([cx + Math.cos(t) * radiusM, cy + Math.sin(t) * radiusM]);
  }
  return ring;
}
