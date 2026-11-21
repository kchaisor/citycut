import {
  checkSparqlJson,
  finaliseItems,
  groupBindings,
  landmarkQueryUrl,
  type WikidataBox,
  type WikidataLandmark,
} from "../../shared/wikidataLandmarks.js";
import { squareBBox, toLocal } from "./geo";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, CityModel } from "../types";

export type { WikidataLandmark } from "../../shared/wikidataLandmarks.js";

const PREBAKED_BASE = import.meta.env.VITE_PREBAKED_TILES_BASE ?? import.meta.env.BASE_URL;
export const WIKIDATA_LANDMARKS_URL = `${PREBAKED_BASE}wikidata-landmarks.json`;
export const WIKIDATA_LIVE_TIMEOUT_MS = 8_000;
export const WIKIDATA_UNAVAILABLE = "Not available for this area";

export type WikidataLandmarksDocument = {
  schemaVersion: number;
  generatedAt: string;
  bbox: WikidataBox;
  items: WikidataLandmark[];
};

export type WikidataCutItems =
  | { ok: true; source: "baked"; items: WikidataLandmark[]; queryDate: string }
  | { ok: true; source: "live"; items: WikidataLandmark[] }
  | { ok: false; reason: string };

export type WikidataMatch = { building: BuildingFeat; landmark: WikidataLandmark; via: "osm" | "footprint" };

export type WikidataMatchResult = {
  matches: WikidataMatch[];
  noFootprint: WikidataLandmark[];
  ambiguous: WikidataLandmark[];
};

export type WikidataDeps = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function isDocument(value: unknown): value is WikidataLandmarksDocument {
  const doc = value as WikidataLandmarksDocument | null;
  return Boolean(doc && typeof doc === "object" && Array.isArray(doc.items) && doc.bbox && typeof doc.bbox.west === "number");
}

let bakedPromise: Promise<WikidataLandmarksDocument | null> | null = null;

export function resetWikidataCache(): void {
  bakedPromise = null;
}

async function loadBaked(fetchImpl: typeof fetch): Promise<WikidataLandmarksDocument | null> {
  bakedPromise ??= (async () => {
    try {
      const response = await fetchImpl(WIKIDATA_LANDMARKS_URL, { referrerPolicy: "no-referrer" });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      return isDocument(body) ? body : null;
    } catch {
      return null;
    }
  })();
  return bakedPromise;
}

export function cutBox(model: Pick<CityModel, "center" | "sideM" | "widthM" | "heightM">): WikidataBox {
  const sideM = Math.max(model.sideM, model.widthM ?? 0, model.heightM ?? 0);
  const box = squareBBox(model.center, sideM);
  return { west: box.west, south: box.south, east: box.east, north: box.north };
}

export function boxContains(outer: WikidataBox, inner: WikidataBox): boolean {
  return inner.west >= outer.west && inner.east <= outer.east && inner.south >= outer.south && inner.north <= outer.north;
}

export function clipToBox(items: WikidataLandmark[], box: WikidataBox): WikidataLandmark[] {
  return items.filter((i) => i.lon >= box.west && i.lon <= box.east && i.lat >= box.south && i.lat <= box.north);
}

async function queryLive(box: WikidataBox, fetchImpl: typeof fetch, timeoutMs: number): Promise<WikidataLandmark[]> {
  const response = await fetchImpl(landmarkQueryUrl(box), {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/sparql-results+json" },
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`Wikidata answered HTTP ${response.status}`);
  return finaliseItems(groupBindings(checkSparqlJson(await response.json())), box).items;
}

export async function loadWikidataForCut(box: WikidataBox, deps: WikidataDeps = {}): Promise<WikidataCutItems> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baked = await loadBaked(fetchImpl);
  if (baked && boxContains(baked.bbox, box)) {
    return { ok: true, source: "baked", items: clipToBox(baked.items, box), queryDate: baked.generatedAt };
  }
  try {
    return { ok: true, source: "live", items: await queryLive(box, fetchImpl, deps.timeoutMs ?? WIKIDATA_LIVE_TIMEOUT_MS) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function insideFootprint(building: BuildingFeat, point: [number, number]): boolean {
  return pointInPolygon(point, building.ring, building.holes);
}

function candidateBuildings(landmark: WikidataLandmark, buildings: BuildingFeat[], center: CityModel["center"]) {
  const ways = new Set(landmark.osmWayIds ?? []);
  const byOsm = ways.size > 0 ? buildings.filter((b) => b.osmWayIds?.some((id) => ways.has(id))) : [];
  if (byOsm.length === 1) return { buildings: byOsm, via: "osm" as const };
  const point = toLocal(landmark.lat, landmark.lon, center);
  const pool = byOsm.length > 1 ? byOsm : buildings;
  return { buildings: pool.filter((b) => insideFootprint(b, point)), via: "footprint" as const };
}

export function matchWikidataLandmarks(
  landmarks: WikidataLandmark[],
  buildings: BuildingFeat[],
  center: CityModel["center"],
): WikidataMatchResult {
  const mapBuildings = buildings.filter((b) => !b.importedMassing);
  const claims = new Map<number, WikidataMatch[]>();
  const noFootprint: WikidataLandmark[] = [];
  const ambiguous: WikidataLandmark[] = [];
  for (const landmark of landmarks) {
    const found = candidateBuildings(landmark, mapBuildings, center);
    if (found.buildings.length === 0) noFootprint.push(landmark);
    else if (found.buildings.length > 1) ambiguous.push(landmark);
    else {
      const building = found.buildings[0]!;
      claims.set(building.id, [...(claims.get(building.id) ?? []), { building, landmark, via: found.via }]);
    }
  }
  const matches: WikidataMatch[] = [];
  for (const claim of claims.values()) {
    const viaOsm = claim.filter((c) => c.via === "osm");
    if (claim.length === 1) matches.push(claim[0]!);
    else if (viaOsm.length === 1) {
      matches.push(viaOsm[0]!);
      ambiguous.push(...claim.filter((c) => c.via !== "osm").map((c) => c.landmark));
    } else ambiguous.push(...claim.map((c) => c.landmark));
  }
  matches.sort((a, b) => a.building.id - b.building.id);
  return { matches, noFootprint, ambiguous };
}

export type WikidataStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "failed"; reason: string }
  | {
      state: "ok";
      source: "baked" | "live";
      queryDate: string | null;
      itemsInCut: number;
      matched: number;
      noFootprint: number;
      ambiguous: number;
    };

export function wikidataStatus(items: WikidataCutItems, result: WikidataMatchResult): WikidataStatus {
  if (!items.ok) return { state: "failed", reason: items.reason };
  return {
    state: "ok",
    source: items.source,
    queryDate: items.source === "baked" ? items.queryDate : null,
    itemsInCut: items.items.length,
    matched: result.matches.length,
    noFootprint: result.noFootprint.length,
    ambiguous: result.ambiguous.length,
  };
}

export function closestCitedHeight(landmark: WikidataLandmark, modelHeightM: number): number | null {
  if (landmark.heightsM.length === 0) return null;
  return landmark.heightsM.reduce((best, h) => (Math.abs(h - modelHeightM) < Math.abs(best - modelHeightM) ? h : best));
}

export type WikidataHeightGap = {
  qid: string;
  name: string;
  buildingId: number;
  modelHeightM: number;
  citedHeightM: number;
  gapFraction: number;
};

export function wikidataHeightGaps(matches: WikidataMatch[], tolerance = 0.1): WikidataHeightGap[] {
  const gaps: WikidataHeightGap[] = [];
  for (const { building, landmark } of matches) {
    const cited = closestCitedHeight(landmark, building.height);
    if (cited === null || cited <= 0) continue;
    const gapFraction = Math.abs(building.height - cited) / cited;
    if (gapFraction > tolerance) {
      gaps.push({
        qid: landmark.qid,
        name: landmark.name,
        buildingId: building.id,
        modelHeightM: building.height,
        citedHeightM: cited,
        gapFraction: Math.round(gapFraction * 1000) / 1000,
      });
    }
  }
  return gaps;
}
