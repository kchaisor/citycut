import { clipPolyline } from "./clip";
import { M_PER_DEG_LAT, mPerDegLon, openRing, toLocal } from "./geo";
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
  /** Outer rings with holes, in local east/north metres at the cut centre. */
  polygons: ParcelPolygon[];
  /** Boundary polylines clipped to the cut square, for plan and exports. */
  boundaryLines: Pt[][];
};

type GeoFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: { parcel_pfi?: unknown; parcel_spi?: unknown; prop_pfi?: unknown; spi?: unknown } | null;
};

type GeoCollection = {
  features?: GeoFeature[];
  error?: { message?: string };
};

function parcelId(properties: GeoFeature["properties"]): string | null {
  const raw = properties?.parcel_pfi ?? properties?.parcel_spi ?? properties?.prop_pfi ?? properties?.spi;
  if (raw == null || raw === "") return null;
  return String(raw);
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

function polygonsFromGeometry(geometry: GeoFeature["geometry"], origin: LonLat): ParcelPolygon[] {
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

/** One GeoJSON feature → parcel metadata and local geometry. */
export function parseSiteParcelFeature(json: unknown, origin: LonLat, half: number): SiteParcel | null {
  const collection = (json ?? {}) as GeoCollection;
  const feature = collection.features?.[0];
  if (!feature) return null;
  const id = parcelId(feature.properties);
  if (!id) return null;
  const polygons = polygonsFromGeometry(feature.geometry, origin);
  if (polygons.length === 0) return null;
  const rings = polygons.flatMap((poly) => [poly.outer, ...poly.holes]);
  return {
    parcelPfi: id,
    polygons,
    boundaryLines: clipBoundaryLines(ringsToBoundaryLines(rings), half),
  };
}

/** Small WGS84 envelope around the geocoded point (one parcel, no paging). */
export function siteParcelEnvelope(point: LonLat, bufferM = 8): {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference: { wkid: 4326 };
} {
  const dLat = bufferM / M_PER_DEG_LAT;
  const dLon = bufferM / mPerDegLon(point.lat);
  return {
    xmin: point.lon - dLon,
    ymin: point.lat - dLat,
    xmax: point.lon + dLon,
    ymax: point.lat + dLat,
    spatialReference: { wkid: 4326 },
  };
}

export function siteParcelQueryUrl(point: LonLat): string {
  const geometry = JSON.stringify(siteParcelEnvelope(point));
  const params = new URLSearchParams({
    where: "1=1",
    geometry,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "parcel_pfi",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "1",
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
      return (await response.json()) as unknown;
    });
  try {
    const json = await fetchImpl(siteParcelQueryUrl(point), signal);
    if (json == null) return null;
    const parsed = parseSiteParcelFeature(json, origin, half);
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
