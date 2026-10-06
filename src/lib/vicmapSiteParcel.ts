import { clipPolyline } from "./clip";
import { openRing, toLocal } from "./geo";
import { pointInPolygon } from "./useCascade";
import { VICTORIA_BOUNDS, boundsIntersect, type LonLatBounds } from "./vicmapContours";
import type { LonLat, Pt, Ring } from "../types";

/**
 * Vicmap Property title parcel polygons (PARCEL_MP), Department of Transport and Planning.
 * Creative Commons Attribution 4.0 International.
 * https://discover.data.vic.gov.au/dataset/vicmap-property
 */
export const VICMAP_PROPERTY_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Parcel/FeatureServer/0";

export const VICMAP_PROPERTY_ATTRIBUTION =
  "Vicmap Property © State of Victoria (Department of Transport and Planning), CC BY 4.0.";

export const VICMAP_PROPERTY_TIMEOUT_MS = 12_000;

export type ParcelFetch = (url: string, signal: AbortSignal) => Promise<unknown>;

export type ParcelPolygon = {
  outer: Ring;
  holes: Ring[];
};

export type SiteParcel = {
  parcelPfi: string;
  /** Title SPI (may contain a backslash). */
  parcelSpi: string | null;
  /** Outer rings with holes, in local east/north metres at the cut centre. */
  polygons: ParcelPolygon[];
  /** Boundary polylines clipped to the cut square, for plan and exports. */
  boundaryLines: Pt[][];
};

type GeoFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: {
    parcel_pfi?: unknown;
    parcel_spi?: unknown;
    parcel_road?: unknown;
    prop_pfi?: unknown;
    spi?: unknown;
  } | null;
};

type GeoCollection = {
  features?: GeoFeature[];
  error?: { message?: string; code?: number };
};

function parcelPfiFromProperties(properties: GeoFeature["properties"]): string | null {
  const raw = properties?.parcel_pfi ?? properties?.prop_pfi;
  if (raw == null || raw === "") return null;
  return String(raw);
}

function parcelSpiFromProperties(properties: GeoFeature["properties"]): string | null {
  const raw = properties?.parcel_spi ?? properties?.spi;
  if (raw == null || raw === "") return null;
  return String(raw);
}

function isRoadParcel(properties: GeoFeature["properties"]): boolean {
  return String(properties?.parcel_road ?? "")
    .trim()
    .toUpperCase() === "Y";
}

function asRing(raw: unknown, origin: LonLat): Ring | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const ring: Ring = [];
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

export function polygonsFromGeometry(geometry: GeoFeature["geometry"], origin: LonLat): ParcelPolygon[] {
  if (!geometry || typeof geometry !== "object") return [];
  const type = geometry.type;
  const coordinates = geometry.coordinates;
  const out: ParcelPolygon[] = [];
  if (type === "Polygon" && Array.isArray(coordinates)) {
    const outer = asRing(coordinates[0], origin);
    if (!outer) return [];
    const holes: Ring[] = [];
    for (let i = 1; i < coordinates.length; i++) {
      const hole = asRing(coordinates[i], origin);
      if (hole) holes.push(hole);
    }
    out.push({ outer, holes });
    return out;
  }
  if (type === "MultiPolygon" && Array.isArray(coordinates)) {
    for (const polygon of coordinates) {
      if (!Array.isArray(polygon) || polygon.length === 0) continue;
      const outer = asRing(polygon[0], origin);
      if (!outer) continue;
      const holes: Ring[] = [];
      for (let i = 1; i < polygon.length; i++) {
        const hole = asRing(polygon[i], origin);
        if (hole) holes.push(hole);
      }
      out.push({ outer, holes });
    }
  }
  return out;
}

function featureContainsPoint(feature: GeoFeature, point: LonLat, origin: LonLat): boolean {
  const local = toLocal(point.lat, point.lon, origin);
  const polygons = polygonsFromGeometry(feature.geometry, origin);
  return polygons.some((poly) => pointInPolygon(local, poly.outer, poly.holes));
}

/** When Vicmap returns more than one hit, pick the lot polygon that contains the geocoded point. */
export function pickSiteParcelFeature(json: unknown, point: LonLat, origin: LonLat): GeoFeature | null {
  const collection = (json ?? {}) as GeoCollection;
  const features = Array.isArray(collection.features) ? collection.features : [];
  if (features.length === 0) return null;
  if (features.length === 1) return features[0];

  const scored = features.map((feature) => ({
    feature,
    road: isRoadParcel(feature.properties),
    contains: featureContainsPoint(feature, point, origin),
  }));

  const preferred = scored.filter((row) => !row.road && row.contains);
  if (preferred.length > 0) return preferred[0].feature;

  const containing = scored.filter((row) => row.contains);
  if (containing.length > 0) return containing[0].feature;

  return features[0];
}

function ringsToBoundaryLines(rings: Ring[]): Pt[][] {
  const lines: Pt[][] = [];
  for (const ring of rings) {
    if (ring.length < 2) continue;
    const open = openRing(ring);
    if (open.length < 2) continue;
    const closed =
      open[0][0] === open[open.length - 1][0] && open[0][1] === open[open.length - 1][1] ? open : [...open, open[0]];
    lines.push(closed);
  }
  return lines;
}

function clipBoundaryLines(lines: Pt[][], half: number): Pt[][] {
  const min = -half;
  const max = half;
  const out: Pt[][] = [];
  for (const ring of lines) {
    const open = openRing(ring);
    if (open.length < 2) continue;
    const closed = [...open, open[0]];
    out.push(...clipPolyline(closed, min, max));
  }
  return out;
}

/** GeoJSON page → one site parcel at the cut centre. */
export function parseSiteParcelFeature(
  json: unknown,
  point: LonLat,
  origin: LonLat,
  half: number,
): SiteParcel | null {
  const feature = pickSiteParcelFeature(json, point, origin);
  if (!feature) return null;
  const parcelPfi = parcelPfiFromProperties(feature.properties);
  if (!parcelPfi) return null;
  const polygons = polygonsFromGeometry(feature.geometry, origin);
  if (polygons.length === 0) return null;
  const rings = polygons.flatMap((poly) => [poly.outer, ...poly.holes]);
  return {
    parcelPfi,
    parcelSpi: parcelSpiFromProperties(feature.properties),
    polygons,
    boundaryLines: clipBoundaryLines(ringsToBoundaryLines(rings), half),
  };
}

/**
 * Point query against Vicmap Parcel. Do not set resultRecordCount — the service rejects it.
 */
export function siteParcelQueryUrl(point: LonLat): string {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${point.lon},${point.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "parcel_pfi,parcel_spi,parcel_road",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  return `${VICMAP_PROPERTY_URL}/query?${params.toString()}`;
}

function pointInVictoria(point: LonLat): boolean {
  const bounds: LonLatBounds = {
    west: point.lon,
    east: point.lon,
    south: point.lat,
    north: point.lat,
  };
  return boundsIntersect(bounds, VICTORIA_BOUNDS);
}

function collectionError(json: unknown): boolean {
  const collection = (json ?? {}) as GeoCollection;
  return Boolean(collection.error);
}

/**
 * One targeted Vicmap Property request for the parcel at a geocoded point.
 * HTTP 401/403/429 and other failures return null (no retries).
 */
export async function fetchSiteParcelAtPoint(
  point: LonLat,
  origin: LonLat,
  half: number,
  options?: { fetchImpl?: ParcelFetch; signal?: AbortSignal },
): Promise<SiteParcel | null> {
  if (!pointInVictoria(point)) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VICMAP_PROPERTY_TIMEOUT_MS);
  const signal = options?.signal ?? controller.signal;
  const fetchImpl =
    options?.fetchImpl ??
    (async (url, abort) => {
      const response = await fetch(url, { signal: abort, headers: { Accept: "application/json" } });
      if (response.status === 401 || response.status === 403 || response.status === 429) return null;
      if (!response.ok) return null;
      const json = (await response.json()) as unknown;
      if (collectionError(json)) return null;
      return json;
    });
  try {
    const json = await fetchImpl(siteParcelQueryUrl(point), signal);
    if (json == null) return null;
    return parseSiteParcelFeature(json, point, origin, half);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
