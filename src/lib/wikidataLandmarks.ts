import {
  checkSparqlJson,
  finaliseItems,
  groupBindings,
  landmarkQueryUrl,
  LANDMARK_CLASSES,
  WIKIDATA_LANDMARKS_NAME,
  WIKIDATA_SCHEMA_VERSION,
  type WikidataBbox,
  type WikidataLandmark,
  type WikidataLandmarksDocument,
} from "../../shared/wikidataLandmarks.js";
import {
  bboxContains,
  cutBbox,
  matchLandmarks,
  type WikidataLandmarksResult,
} from "./wikidataMatch";
import type { CityModel } from "../types";

export type { WikidataLandmark } from "../../shared/wikidataLandmarks.js";
export {
  bboxContains,
  cutBbox,
  matchLandmarks,
  wikidataHeightGaps,
  type WikidataHeightGap,
  type WikidataLandmarksResult,
  type WikidataMatch,
} from "./wikidataMatch";

const PREBAKED_BASE = import.meta.env.VITE_PREBAKED_TILES_BASE ?? import.meta.env.BASE_URL;
export const WIKIDATA_LANDMARKS_URL = `${PREBAKED_BASE}${WIKIDATA_LANDMARKS_NAME}`;
export const WIKIDATA_TIMEOUT_MS = 8000;

export type WikidataLandmarksState = { status: "idle" } | { status: "loading" } | WikidataLandmarksResult;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type BakedLoad = { ok: true; doc: WikidataLandmarksDocument } | { ok: false; reason: string };

export function parseLandmarksDocument(body: unknown): WikidataLandmarksDocument | null {
  if (!body || typeof body !== "object") return null;
  const doc = body as Partial<WikidataLandmarksDocument>;
  if (doc.schemaVersion !== WIKIDATA_SCHEMA_VERSION || !Array.isArray(doc.items) || !doc.bbox) return null;
  const { west, south, east, north } = doc.bbox;
  if (![west, south, east, north].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return doc as WikidataLandmarksDocument;
}

async function fetchJson(fetchImpl: Fetch, url: string, init: RequestInit = {}, timeoutMs = WIKIDATA_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`timed out after ${timeoutMs / 1000} s`);
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
  }
}

let bakedLoad: Promise<BakedLoad> | null = null;

export function resetWikidataLandmarksCache(): void {
  bakedLoad = null;
}

export function loadBakedLandmarks(fetchImpl: Fetch = fetch): Promise<BakedLoad> {
  bakedLoad ??= fetchJson(fetchImpl, WIKIDATA_LANDMARKS_URL)
    .then((body): BakedLoad => {
      const doc = parseLandmarksDocument(body);
      return doc ? { ok: true, doc } : { ok: false, reason: "Baked Wikidata file is not in the expected format" };
    })
    .catch((err: Error): BakedLoad => ({ ok: false, reason: `Baked Wikidata file not loaded (${err.message})` }));
  return bakedLoad;
}

export async function fetchLiveLandmarks(bbox: WikidataBbox, fetchImpl: Fetch = fetch): Promise<WikidataLandmark[]> {
  const grouped = new Map<string, unknown>();
  for (const classQid of LANDMARK_CLASSES) {
    const body = await fetchJson(fetchImpl, landmarkQueryUrl(bbox, classQid), { headers: { Accept: "application/sparql-results+json" } });
    groupBindings(checkSparqlJson(body), grouped);
  }
  return finaliseItems(grouped, bbox).items;
}

export type WikidataItemsLoad =
  | { status: "ok"; source: "baked" | "live"; generatedAt: string | null; items: WikidataLandmark[] }
  | { status: "failed"; reason: string };

export async function wikidataItemsFor(bbox: WikidataBbox, fetchImpl: Fetch = fetch): Promise<WikidataItemsLoad> {
  const baked = await loadBakedLandmarks(fetchImpl);
  if (baked.ok && bboxContains(baked.doc.bbox, bbox)) {
    return { status: "ok", source: "baked", generatedAt: baked.doc.generatedAt, items: baked.doc.items };
  }
  try {
    return { status: "ok", source: "live", generatedAt: null, items: await fetchLiveLandmarks(bbox, fetchImpl) };
  } catch (err) {
    const live = `live Wikidata query failed (${err instanceof Error ? err.message : String(err)})`;
    return { status: "failed", reason: baked.ok ? `Outside the baked Wikidata area; ${live}.` : `${baked.reason}; ${live}.` };
  }
}

export function landmarksFromLoad(
  model: Pick<CityModel, "center" | "sideM" | "widthM" | "heightM" | "buildings">,
  load: WikidataItemsLoad,
): WikidataLandmarksResult {
  return load.status === "ok" ? matchLandmarks(model, load.items, load.source, load.generatedAt) : load;
}

export async function wikidataLandmarksFor(
  model: Pick<CityModel, "center" | "sideM" | "widthM" | "heightM" | "buildings">,
  fetchImpl: Fetch = fetch,
): Promise<WikidataLandmarksResult> {
  return landmarksFromLoad(model, await wikidataItemsFor(cutBbox(model), fetchImpl));
}
