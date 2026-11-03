import RBush from "rbush";
import { intersectionAreaM2 } from "./comBuildingHeightsMatch";
import { M_PER_DEG_LAT, mPerDegLon, signedArea, toLocal } from "./geo";
import type { LonLat, Ring } from "../types";
import {
  DEMOGRAPHICS_AGE_BANDS,
  DEMOGRAPHICS_HOUSEHOLD_TYPES,
  type DemographicsAgeBand,
  type DemographicsBenchmark,
  type DemographicsCutStats,
  type DemographicsDataset,
  type DemographicsHouseholdType,
  type DemographicsSa1Unit,
} from "./demographicsTypes";
import { treeCanopyCoverPct } from "./demographicsCanopy";

type IndexedSa1 = DemographicsSa1Unit & {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type DemographicsSpatialIndex = RBush<IndexedSa1>;

export function demographicsDatasetInBounds(dataset: DemographicsDataset, center: LonLat): boolean {
  const { west, south, east, north } = dataset.bbox;
  return center.lon >= west && center.lon <= east && center.lat >= south && center.lat <= north;
}

export function buildDemographicsIndex(units: DemographicsSa1Unit[]): DemographicsSpatialIndex {
  const tree = new RBush<IndexedSa1>();
  tree.load(
    units.map((unit) => {
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;
      for (const [lon, lat] of unit.ring) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
      return { ...unit, minX: minLon, minY: minLat, maxX: maxLon, maxY: maxLat };
    }),
  );
  return tree;
}

function lonLatRingToLocal(ring: DemographicsSa1Unit["ring"], origin: LonLat): Ring {
  return ring.map(([lon, lat]) => toLocal(lat, lon, origin));
}

function cutSquareRing(sideM: number): Ring {
  const half = sideM / 2;
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
}

function sa1AreaM2(unit: DemographicsSa1Unit, origin: LonLat): number {
  const fromAttr = unit.areaKm2 * 1_000_000;
  if (fromAttr > 0) return fromAttr;
  const local = lonLatRingToLocal(unit.ring, origin);
  return Math.abs(signedArea(local));
}

function emptyAge(): Record<DemographicsAgeBand, number> {
  return Object.fromEntries(DEMOGRAPHICS_AGE_BANDS.map((band) => [band, 0])) as Record<DemographicsAgeBand, number>;
}

function emptyHouseholds(): Record<DemographicsHouseholdType, number> {
  return Object.fromEntries(DEMOGRAPHICS_HOUSEHOLD_TYPES.map((kind) => [kind, 0])) as Record<
    DemographicsHouseholdType,
    number
  >;
}

export function aggregateDemographicsForCut(input: {
  dataset: DemographicsDataset;
  index: DemographicsSpatialIndex;
  center: LonLat;
  sideM: number;
  canopyPct: number;
}): DemographicsCutStats | null {
  const half = input.sideM / 2;
  const dLon = half / mPerDegLon(input.center.lat);
  const dLat = half / M_PER_DEG_LAT;
  const queryBox = {
    minX: input.center.lon - dLon,
    minY: input.center.lat - dLat,
    maxX: input.center.lon + dLon,
    maxY: input.center.lat + dLat,
  };
  const hits = input.index.search(queryBox);
  const cutRing = cutSquareRing(input.sideM);
  const cutPoly = { ring: cutRing, holes: [] as Ring[] };

  let population = 0;
  const age = emptyAge();
  const households = emptyHouseholds();
  let sa1Cells = 0;

  for (const unit of hits) {
    const localRing = lonLatRingToLocal(unit.ring, input.center);
    const sa1Poly = { ring: localRing, holes: [] as Ring[] };
    const overlapM2 = intersectionAreaM2(sa1Poly, cutPoly);
    if (overlapM2 <= 0) continue;
    const sa1M2 = sa1AreaM2(unit, input.center);
    if (sa1M2 <= 0) continue;
    const fraction = Math.min(1, overlapM2 / sa1M2);
    if (fraction <= 0) continue;
    sa1Cells += 1;
    population += unit.population * fraction;
    for (const band of DEMOGRAPHICS_AGE_BANDS) {
      age[band] += unit.age[band] * fraction;
    }
    for (const kind of DEMOGRAPHICS_HOUSEHOLD_TYPES) {
      households[kind] += unit.households[kind] * fraction;
    }
  }

  if (population <= 0 && sa1Cells === 0) return null;

  const areaKm2 = (input.sideM * input.sideM) / 1_000_000;
  return {
    population: Math.round(population),
    densityPerKm2: areaKm2 > 0 ? Math.round(population / areaKm2) : 0,
    canopyPct: input.canopyPct,
    age,
    households,
    sa1Cells,
  };
}

export function benchmarkPercentages(
  benchmark: DemographicsBenchmark,
  field: "age" | "households",
): Record<string, number> {
  const pop =
    field === "age"
      ? benchmark.population
      : DEMOGRAPHICS_HOUSEHOLD_TYPES.reduce((sum, key) => sum + benchmark.households[key], 0);
  const source = field === "age" ? benchmark.age : benchmark.households;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = pop > 0 ? (value / pop) * 100 : 0;
  }
  return out;
}

export function cutPercentages(stats: DemographicsCutStats, field: "age" | "households"): Record<string, number> {
  const pop =
    field === "age"
      ? stats.population
      : DEMOGRAPHICS_HOUSEHOLD_TYPES.reduce((sum, key) => sum + stats.households[key], 0);
  const source = field === "age" ? stats.age : stats.households;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = pop > 0 ? (value / pop) * 100 : 0;
  }
  return out;
}

export function demographicsCanopyFromModel(model: Parameters<typeof treeCanopyCoverPct>[0]): number {
  return treeCanopyCoverPct(model);
}
