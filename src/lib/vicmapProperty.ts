import { clipPolyline } from "./clip";
import { fromLocal, squareBBox, toLocal } from "./geo";
import { VICTORIA_BOUNDS, boundsIntersect, type LonLatBounds } from "./vicmapContours";
import type { LonLat, Pt } from "../types";

/**
 * Vicmap Property parcel polygons (PROPERTY_MP), Department of Transport and Planning.
 * Creative Commons Attribution 4.0 International.
 * https://discover.data.vic.gov.au/dataset/vicmap-property
 */
export const VICMAP_PROPERTY_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Property/FeatureServer/0";

export const VICMAP_PROPERTY_DATASET_URL =
  "https://discover.data.vic.gov.au/dataset/vicmap-property";

export const VICMAP_PROPERTY_ATTRIBUTION =
  "Vicmap Property © State of Victoria (Department of Transport and Planning), CC BY 4.0.";

export const VICMAP_PROPERTY_PAGE = 2000;
export const VICMAP_PROPERTY_TIMEOUT_MS = 8000;
const MAX_PAGES = 12;

export type PropertyFetch = (url: string, signal: AbortSignal) => Promise<unknown>;

export type PropertyPage = {
  lines: Pt[][];
  count: number;
  exceeded: boolean;
};

export type PropertyLayer = {
  lines: Pt[][];
  featureCount: number;
  capped: boolean;
  fetchMs: number;
};

const cache = new Map<string, PropertyLayer>();

export function clearVicmapPropertyCache(): void {
  cache.clear();
}

export function propertyCacheKey(bounds: LonLatBounds): string {
  const round = (value: number) => value.toFixed(5);
  return `${round(bounds.west)},${round(bounds.south)},${round(bounds.east)},${round(bounds.north)}`;
}

export function propertyQueryUrl(bounds: LonLatBounds, offset: number): string {
  const geometry = JSON.stringify({
    xmin: bounds.west,
    ymin: bounds.south,
    xmax: bounds.east,
    ymax: bounds.north,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    where: "1=1",
    geometry,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "prop_pfi",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    orderByFields: "OBJECTID",
    resultRecordCount: String(VICMAP_PROPERTY_PAGE),
    resultOffset: String(offset),
    f: "geojson",
  });
  return `${VICMAP_PROPERTY_URL}/query?${params.toString()}`;
}

type GeoFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: { prop_pfi?: unknown } | null;
};

type GeoCollection = {
  type?: string;
  exceededTransferLimit?: boolean;
  properties?: { exceededTransferLimit?: boolean };
  features?: GeoFeature[];
};

function asRing(raw: unknown, origin: LonLat): Pt[] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const ring: Pt[] = [];
  for (const vertex of raw) {
    if (!Array.isArray(vertex) || vertex.length < 2) continue;
    const lon = vertex[0];
    const lat = vertex[1];
    if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      continue;
    }
    ring.push(toLocal(lat, lon, origin));
  }
  return ring.length >= 3 ? ring : null;
}

function ringsFromGeometry(geometry: GeoFeature["geometry"], origin: LonLat): Pt[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const type = geometry.type;
  const coordinates = geometry.coordinates;
  const rings: Pt[][] = [];
  if (type === "Polygon" && Array.isArray(coordinates)) {
    for (const raw of coordinates) {
      const ring = asRing(raw, origin);
      if (ring) rings.push(ring);
    }
    return rings;
  }
  if (type === "MultiPolygon" && Array.isArray(coordinates)) {
    for (const polygon of coordinates) {
      if (!Array.isArray(polygon)) continue;
      for (const raw of polygon) {
        const ring = asRing(raw, origin);
        if (ring) rings.push(ring);
      }
    }
  }
  return rings;
}

/** One GeoJSON page. Drops features without geometry or parcel id. */
export function parsePropertyPage(json: unknown, origin: LonLat): PropertyPage {
  const collection = (json ?? {}) as GeoCollection;
  const features = Array.isArray(collection.features) ? collection.features : [];
  const lines: Pt[][] = [];
  for (const feature of features) {
    if (feature.properties?.prop_pfi == null || feature.properties.prop_pfi === "") continue;
    for (const ring of ringsFromGeometry(feature.geometry, origin)) {
      lines.push(ring);
    }
  }
  const exceeded = Boolean(
    collection.properties?.exceededTransferLimit || collection.exceededTransferLimit,
  );
  return { lines, count: features.length, exceeded };
}

export function nextPropertyOffset(offset: number, page: Pick<PropertyPage, "count" | "exceeded">): number | null {
  if (page.count <= 0) return null;
  if (page.count < VICMAP_PROPERTY_PAGE && !page.exceeded) return null;
  return offset + VICMAP_PROPERTY_PAGE;
}

export function viewBoundsLonLat(view: { x: number; y: number; w: number; h: number }, origin: LonLat): LonLatBounds {
  const sw = fromLocal([view.x, view.y], origin);
  const ne = fromLocal([view.x + view.w, view.y + view.h], origin);
  return {
    west: Math.min(sw.lon, ne.lon),
    east: Math.max(sw.lon, ne.lon),
    south: Math.min(sw.lat, ne.lat),
    north: Math.max(sw.lat, ne.lat),
  };
}

export function clipPropertyLines(lines: Pt[][], half: number): Pt[][] {
  const min = -half;
  const max = half;
  const out: Pt[][] = [];
  for (const ring of lines) {
    const open = openPropertyRing(ring);
    if (open.length < 2) continue;
    const closed = [...open, open[0]];
    out.push(...clipPolyline(closed, min, max));
  }
  return out;
}

function openPropertyRing(ring: Pt[]): Pt[] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 0.05) return ring.slice(0, -1);
  return ring;
}

async function fetchPages(
  bounds: LonLatBounds,
  origin: LonLat,
  half: number,
  fetchImpl: PropertyFetch,
  signal: AbortSignal,
): Promise<PropertyLayer> {
  const started = performance.now();
  const merged: Pt[][] = [];
  let featureCount = 0;
  let capped = false;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await fetchImpl(propertyQueryUrl(bounds, offset), signal);
    const parsed = parsePropertyPage(json, origin);
    featureCount += parsed.count;
    merged.push(...parsed.lines);
    const next = nextPropertyOffset(offset, parsed);
    if (next === null) break;
    if (page === MAX_PAGES - 1) capped = true;
    offset = next;
  }
  return {
    lines: clipPropertyLines(merged, half),
    featureCount,
    capped,
    fetchMs: Math.round(performance.now() - started),
  };
}

export async function fetchVicmapPropertyLayer(
  bounds: LonLatBounds,
  origin: LonLat,
  half: number,
  options?: { fetchImpl?: PropertyFetch; signal?: AbortSignal; useCache?: boolean },
): Promise<PropertyLayer | null> {
  if (!boundsIntersect(bounds, VICTORIA_BOUNDS)) return null;
  const key = propertyCacheKey(bounds);
  if (options?.useCache !== false) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VICMAP_PROPERTY_TIMEOUT_MS);
  const signal = options?.signal ?? controller.signal;
  const fetchImpl =
    options?.fetchImpl ??
    (async (url, abort) => {
      const response = await fetch(url, { signal: abort, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Vicmap Property answered ${response.status}.`);
      const json = (await response.json()) as { error?: { message?: string } };
      if (json.error) throw new Error(json.error.message || "Vicmap Property could not be queried.");
      return json;
    });
  try {
    const layer = await fetchPages(bounds, origin, half, fetchImpl, signal);
    if (options?.useCache !== false) cache.set(key, layer);
    return layer;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Full cut square, for exports. */
export function modelPropertyBounds(center: LonLat, sideM: number): LonLatBounds {
  return squareBBox(center, sideM);
}

export async function fetchPropertyBoundariesForModel(
  center: LonLat,
  sideM: number,
  options?: { fetchImpl?: PropertyFetch; signal?: AbortSignal; useCache?: boolean },
): Promise<PropertyLayer | null> {
  const half = sideM / 2;
  return fetchVicmapPropertyLayer(modelPropertyBounds(center, sideM), center, half, options);
}
