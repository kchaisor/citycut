import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { squareBBox, toLocal } from "./geo";
import { siteFramePolygon, type SiteFrameShape } from "./siteFrame";
import type { LonLat, Pt } from "../types";

export const CENSUS_ATTRIBUTION = "Source: ABS Census 2021, CC BY 4.0";
export const CENSUS_SOURCE_NAME = "ABS Census 2021 GCP (SA1, Victoria)";

export const CENSUS_FIELDS = [
  "pop",
  "a0_14",
  "a15_24",
  "a25_34",
  "a35_44",
  "a45_54",
  "a55_64",
  "a65p",
  "medAge",
  "medHhInc",
  "hhFamily",
  "hhLone",
  "hhGroup",
  "dwHouse",
  "dwSemi",
  "dwApt13",
  "dwApt4p",
  "dwOther",
  "car0",
  "car1",
  "car2",
  "car3p",
  "tenOwned",
  "tenMortgage",
  "tenRent",
  "tenOther",
  "twCar",
  "twPt",
  "twActive",
  "twMulti",
  "twHome",
  "twOther",
] as const;

export type CensusField = (typeof CENSUS_FIELDS)[number];
export type CensusValues = Record<CensusField, number>;

export const AGE_BANDS = [
  { key: "a0_14", label: "0–14" },
  { key: "a15_24", label: "15–24" },
  { key: "a25_34", label: "25–34" },
  { key: "a35_44", label: "35–44" },
  { key: "a45_54", label: "45–54" },
  { key: "a55_64", label: "55–64" },
  { key: "a65p", label: "65+" },
] as const satisfies readonly { key: CensusField; label: string }[];

export type CensusIndexEntry = { code: string; name: string; gcc: string; bbox: [number, number, number, number] };

export type CensusIndex = {
  source: string;
  licence: string;
  fields: string[];
  coordScale: number;
  greaterMelbourne: number[];
  sa2: CensusIndexEntry[];
};

export type CensusSa1Raw = { code: string; areaKm2: number; values: number[]; geometry: number[][][] };

export type CensusChunk = { code: string; name: string; sa2: number[] | null; sa1: CensusSa1Raw[] };

export type SelectedSa1 = {
  code: string;
  sa2Code: string;
  values: CensusValues;
  fraction: number;
  clippedKm2: number;
  rings: Pt[][];
  containsCentre: boolean;
};

export type CensusSiteSummary = {
  values: CensusValues;
  clippedKm2: number;
  densityPerKm2: number;
  estimated: boolean;
};

export type CensusSiteResult =
  | {
      status: "ok";
      sa1: SelectedSa1[];
      site: CensusSiteSummary;
      parentSa2: { code: string; name: string; values: CensusValues | null };
      greaterMelbourne: CensusValues;
    }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

type ClipFns = { intersection: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon };

function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.intersection === "function") return loaded;
  if (loaded.default && typeof loaded.default.intersection === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

export function toValues(raw: readonly number[], fields: readonly string[] = CENSUS_FIELDS): CensusValues {
  const values = {} as CensusValues;
  for (const field of CENSUS_FIELDS) {
    const index = fields.indexOf(field);
    values[field] = index >= 0 ? Number(raw[index] ?? 0) : 0;
  }
  return values;
}

export function decodeRing(deltas: readonly number[], scale: number): Pt[] {
  const ring: Pt[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < deltas.length; i += 2) {
    x += deltas[i];
    y += deltas[i + 1];
    ring.push([x / scale, y / scale]);
  }
  return ring;
}

export function ringArea(ring: readonly Pt[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(area) / 2;
}

function polygonArea(polygon: readonly (readonly Pt[])[]): number {
  if (polygon.length === 0) return 0;
  return Math.max(0, ringArea(polygon[0]) - polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0));
}

export function multiPolygonArea(multi: readonly (readonly (readonly Pt[])[])[]): number {
  return multi.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

export function pointInRing(point: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function candidateSa2Codes(index: CensusIndex, center: LonLat, sideM: number): string[] {
  const box = squareBBox(center, sideM);
  return index.sa2
    .filter(({ bbox }) => bbox[0] <= box.east && bbox[2] >= box.west && bbox[1] <= box.north && bbox[3] >= box.south)
    .map(({ code }) => code);
}

export function selectSa1s(
  chunks: readonly CensusChunk[],
  scale: number,
  fields: readonly string[],
  center: LonLat,
  sideM: number,
  shape: SiteFrameShape,
): SelectedSa1[] {
  const { intersection } = clippingFns();
  const frame = siteFramePolygon(sideM, shape);
  const selected: SelectedSa1[] = [];
  for (const chunk of chunks) {
    for (const sa1 of chunk.sa1) {
      const local = sa1.geometry.map((polygon) =>
        polygon.map((ring) => decodeRing(ring, scale).map(([lon, lat]) => toLocal(lat, lon, center))),
      );
      const fullArea = multiPolygonArea(local);
      if (fullArea <= 0) continue;
      let clipped: MultiPolygon;
      try {
        clipped = intersection(local as unknown as MultiPolygon, frame);
      } catch {
        continue;
      }
      const clippedArea = multiPolygonArea(clipped as unknown as Pt[][][]);
      if (clippedArea <= 0) continue;
      const containsCentre = local.some(
        (polygon) => pointInRing([0, 0], polygon[0]) && !polygon.slice(1).some((hole) => pointInRing([0, 0], hole)),
      );
      selected.push({
        code: sa1.code,
        sa2Code: chunk.code,
        values: toValues(sa1.values, fields),
        fraction: Math.min(1, clippedArea / fullArea),
        clippedKm2: clippedArea / 1e6,
        rings: local.map((polygon) => polygon[0]),
        containsCentre,
      });
    }
  }
  return selected.sort((a, b) => a.code.localeCompare(b.code));
}

const MEDIAN_FIELDS: readonly CensusField[] = ["medAge", "medHhInc"];

export function aggregateSa1s(selection: readonly SelectedSa1[]): CensusSiteSummary {
  const values = {} as CensusValues;
  for (const field of CENSUS_FIELDS) values[field] = 0;
  let weight = 0;
  const weighted: Record<string, number> = { medAge: 0, medHhInc: 0 };
  const weights: Record<string, number> = { medAge: 0, medHhInc: 0 };
  for (const sa1 of selection) {
    for (const field of CENSUS_FIELDS) {
      if (MEDIAN_FIELDS.includes(field)) continue;
      values[field] += sa1.values[field] * sa1.fraction;
    }
    const people = sa1.values.pop * sa1.fraction;
    weight += people;
    for (const field of MEDIAN_FIELDS) {
      if (sa1.values[field] > 0) {
        weighted[field] += sa1.values[field] * people;
        weights[field] += people;
      }
    }
  }
  for (const field of MEDIAN_FIELDS) values[field] = weights[field] > 0 ? weighted[field] / weights[field] : 0;
  const clippedKm2 = selection.reduce((sum, sa1) => sum + sa1.clippedKm2, 0);
  return {
    values,
    clippedKm2,
    densityPerKm2: clippedKm2 > 0 ? weight / clippedKm2 : 0,
    estimated: selection.some((sa1) => sa1.fraction < 0.999),
  };
}

export function parentSa2Code(selection: readonly SelectedSa1[]): string | null {
  const centre = selection.find((sa1) => sa1.containsCentre);
  if (centre) return centre.sa2Code;
  const byArea = new Map<string, number>();
  for (const sa1 of selection) byArea.set(sa1.sa2Code, (byArea.get(sa1.sa2Code) ?? 0) + sa1.clippedKm2);
  let best: string | null = null;
  let bestArea = -1;
  for (const [code, area] of byArea) {
    if (area > bestArea) {
      best = code;
      bestArea = area;
    }
  }
  return best;
}

export function hundredPeople(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((n) => (Math.max(0, n) / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return floors;
}

export function share(part: number, parts: readonly number[]): number {
  const total = parts.reduce((sum, n) => sum + n, 0);
  return total > 0 ? part / total : 0;
}

export function censusBaseUrl(): string {
  return `${import.meta.env.BASE_URL}census/`;
}

type Fetcher = (url: string) => Promise<Response>;

async function fetchJson<T>(fetcher: Fetcher, url: string): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

let indexPromise: Promise<CensusIndex> | null = null;
const chunkCache = new Map<string, Promise<CensusChunk>>();

export function resetCensusCache(): void {
  indexPromise = null;
  chunkCache.clear();
}

export async function loadCensusForSite(
  center: LonLat,
  sideM: number,
  shape: SiteFrameShape,
  options: { fetcher?: Fetcher; baseUrl?: string } = {},
): Promise<CensusSiteResult> {
  const fetcher = options.fetcher ?? ((url: string) => fetch(url));
  const base = options.baseUrl ?? censusBaseUrl();
  try {
    if (!indexPromise || options.fetcher) indexPromise = fetchJson<CensusIndex>(fetcher, `${base}index.json`);
    const index = await indexPromise;
    const codes = candidateSa2Codes(index, center, sideM);
    if (codes.length === 0) {
      return { status: "unavailable", reason: "This site is outside the ABS Census 2021 coverage bundled here (Victoria SA1s only)." };
    }
    const chunks = await Promise.all(
      codes.map((code) => {
        const key = `${base}${code}`;
        let pending = options.fetcher ? undefined : chunkCache.get(key);
        if (!pending) {
          pending = fetchJson<CensusChunk>(fetcher, `${base}sa2/${code}.json`);
          if (!options.fetcher) chunkCache.set(key, pending);
          pending.catch(() => chunkCache.delete(key));
        }
        return pending;
      }),
    );
    const sa1 = selectSa1s(chunks, index.coordScale, index.fields, center, sideM, shape);
    if (sa1.length === 0) {
      return { status: "unavailable", reason: "No ABS Census 2021 SA1 overlaps this site (Victoria SA1s only)." };
    }
    const parentCode = parentSa2Code(sa1) ?? sa1[0].sa2Code;
    const parent = chunks.find((chunk) => chunk.code === parentCode);
    return {
      status: "ok",
      sa1,
      site: aggregateSa1s(sa1),
      parentSa2: {
        code: parentCode,
        name: parent?.name ?? parentCode,
        values: parent?.sa2 ? toValues(parent.sa2, index.fields) : null,
      },
      greaterMelbourne: toValues(index.greaterMelbourne, index.fields),
    };
  } catch (error) {
    indexPromise = null;
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", reason: `Could not load ${CENSUS_SOURCE_NAME}: ${message}` };
  }
}
