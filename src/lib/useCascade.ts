import { fallbackBuildingHeightM } from "./buildingFallbackHeight";
import { useFromZone } from "./buildingUse";
import { clampBuildingHeight } from "./height";
import { openRing, signedArea, toLocal } from "./geo";
import type { BuildingFeat, LonLat, Pt, UseTierFailure } from "../types";

export type FrameBBox = { south: number; west: number; north: number; east: number };

export const TIER_TIMEOUT_MS = 15_000;
const ZONE_LIMIT = 2000;

export type ZonePolygon = { code: string; description?: string; outer: Pt[]; holes: Pt[][]; area: number };

type BBox2 = { minX: number; minY: number; maxX: number; maxY: number };

export function footprintArea(ring: Pt[], holes: Pt[][]): number {
  let area = Math.abs(signedArea(ring));
  for (const hole of holes) area -= Math.abs(signedArea(hole));
  return Math.max(0, area);
}

function ringBBox(ring: Pt[]): BBox2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function pointInRing(point: Pt, ring: Pt[]): boolean {
  const pts = openRing(ring);
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const crosses = yi > point[1] !== yj > point[1];
    if (!crosses) continue;
    const x = ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (point[0] < x) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: Pt, outer: Pt[], holes: Pt[][] = []): boolean {
  if (!pointInRing(point, outer)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

/** Area-weighted centroid, then a vertex average, then an edge midpoint. */
export function interiorPoint(ring: Pt[], holes: Pt[][] = []): Pt {
  const points = openRing(ring);
  if (points.length === 0) return [0, 0];
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    twice += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(twice) > 1e-6) {
    const at: Pt = [cx / (3 * twice), cy / (3 * twice)];
    if (pointInPolygon(at, ring, holes)) return at;
  }
  let east = 0;
  let north = 0;
  for (const point of points) {
    east += point[0];
    north += point[1];
  }
  const average: Pt = [east / points.length, north / points.length];
  if (pointInPolygon(average, ring, holes)) return average;
  const mid: Pt = [
    (points[0][0] + points[Math.floor(points.length / 2)][0]) / 2,
    (points[0][1] + points[Math.floor(points.length / 2)][1]) / 2,
  ];
  if (pointInPolygon(mid, ring, holes)) return mid;
  return points[0];
}

class GridIndex<T> {
  private buckets = new Map<string, T[]>();
  private overflow: T[] = [];

  constructor(private cell: number) {}

  insert(bbox: BBox2, item: T) {
    const x0 = Math.floor(bbox.minX / this.cell);
    const x1 = Math.floor(bbox.maxX / this.cell);
    const y0 = Math.floor(bbox.minY / this.cell);
    const y1 = Math.floor(bbox.maxY / this.cell);
    const span = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (!Number.isFinite(span) || span > 20_000) {
      this.overflow.push(item);
      return;
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = `${x}:${y}`;
        const bucket = this.buckets.get(key);
        if (bucket) bucket.push(item);
        else this.buckets.set(key, [item]);
      }
    }
  }

  queryPoint(point: Pt): T[] {
    const key = `${Math.floor(point[0] / this.cell)}:${Math.floor(point[1] / this.cell)}`;
    const bucket = this.buckets.get(key);
    if (!bucket) return this.overflow;
    if (this.overflow.length === 0) return bucket;
    return bucket.concat(this.overflow);
  }
}

/**
 * Vicmap planning zones. The bbox is minLon,minLat,maxLon,maxLat,CRS:84.
 * An EPSG:4326 bbox in lat,lon order returns no features.
 */
export function zoneWfsUrl(bounds: FrameBBox): string {
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north},CRS:84`;
  const url = new URL("https://opendata.maps.vic.gov.au/geoserver/wfs");
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", "open-data-platform:plan_zone");
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("propertyName", "zone_code,zone_description,geom");
  url.searchParams.set("count", String(ZONE_LIMIT));
  url.searchParams.set("bbox", bbox);
  return url.toString();
}

export type TierFetchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type TierBody = { ok: true; body: unknown } | { ok: false; reason: string };

export async function fetchTierJson(url: string, options: TierFetchOptions = {}): Promise<TierBody> {
  const timeoutMs = options.timeoutMs ?? TIER_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  try {
    if (options.signal?.aborted) {
      const error = new Error("Aborted");
      error.name = "AbortError";
      throw error;
    }
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403 || response.status === 429 || !response.ok) {
      return { ok: false, reason: String(response.status) };
    }
    try {
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false, reason: "network" };
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, reason: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function asLonLat(coord: unknown): Pt | null {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const a = Number(coord[0]);
  const b = Number(coord[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lon = Math.abs(a) > 90 ? a : b;
  const lat = Math.abs(a) > 90 ? b : a;
  return [lon, lat];
}

function ringFromCoords(coords: unknown, origin: LonLat): Pt[] {
  if (!Array.isArray(coords)) return [];
  const ring: Pt[] = [];
  for (const coord of coords) {
    const lonLat = asLonLat(coord);
    if (!lonLat) continue;
    ring.push(toLocal(lonLat[1], lonLat[0], origin));
  }
  return ring;
}

function polygonsFromGeometry(geometry: unknown, origin: LonLat, code: string, description?: string): ZonePolygon[] {
  if (!geometry || typeof geometry !== "object") return [];
  const typed = geometry as { type?: string; coordinates?: unknown };
  const polygons: unknown[] =
    typed.type === "Polygon"
      ? [typed.coordinates]
      : typed.type === "MultiPolygon" && Array.isArray(typed.coordinates)
        ? typed.coordinates
        : [];
  const parsed: ZonePolygon[] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) continue;
    const outer = ringFromCoords(polygon[0], origin);
    const holes = polygon.slice(1).map((hole) => ringFromCoords(hole, origin)).filter((hole) => hole.length >= 4);
    if (outer.length < 4) continue;
    parsed.push({ code, description, outer, holes, area: footprintArea(outer, holes) });
  }
  return parsed;
}

function parseZones(body: unknown, origin: LonLat): ZonePolygon[] {
  if (!body || typeof body !== "object") return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const polygons: ZonePolygon[] = [];
  for (const feature of features.slice(0, ZONE_LIMIT)) {
    if (!feature || typeof feature !== "object") continue;
    const record = feature as {
      properties?: { zone_code?: unknown; zone_description?: unknown };
      geometry?: unknown;
    };
    const code = record.properties?.zone_code;
    if (typeof code !== "string" || !code.trim()) continue;
    const descRaw = record.properties?.zone_description;
    const description = typeof descRaw === "string" && descRaw.trim() ? descRaw.trim() : undefined;
    polygons.push(...polygonsFromGeometry(record.geometry, origin, code.trim(), description));
  }
  return polygons;
}

export type LoadedTiers = {
  zones: ZonePolygon[] | null;
  failures: UseTierFailure[];
};

/** One Vicmap request. A failed response is skipped. No retries. */
export async function loadUseTiers(
  bounds: FrameBBox,
  origin: LonLat,
  options: TierFetchOptions = {},
): Promise<LoadedTiers> {
  const zoneBody = await fetchTierJson(zoneWfsUrl(bounds), options);
  if (zoneBody.ok) return { zones: parseZones(zoneBody.body, origin), failures: [] };
  return { zones: null, failures: [{ id: "zone", tier: "zone", message: "zones unavailable" }] };
}

function applyFallbackHeightFromZone(building: BuildingFeat, zoneCode: string | null): BuildingFeat {
  if (!building.heightFromFallback) return building;
  const height = clampBuildingHeight(
    fallbackBuildingHeightM({
      footprintAreaM2: footprintArea(building.ring, building.holes),
      zoneCode,
    }),
  );
  if (Math.abs(height - building.height) < 0.001) return building;
  const next: BuildingFeat = { ...building, height };
  if (building.extrusionParts?.length) {
    next.extrusionParts = building.extrusionParts.map((part) => ({
      ...part,
      height: Math.max(1, height - (part.base ?? 0)),
    }));
  }
  return next;
}

function zoneAtBuilding(index: GridIndex<ZonePolygon>, building: BuildingFeat): ZonePolygon | null {
  const at = interiorPoint(building.ring, building.holes);
  const covers = index
    .queryPoint(at)
    .filter((zone) => pointInPolygon(at, zone.outer, zone.holes))
    .sort((a, b) => a.area - b.area);
  return covers[0] ?? null;
}

function applyZones(buildings: BuildingFeat[], zones: ZonePolygon[]): BuildingFeat[] {
  const index = new GridIndex<ZonePolygon>(80);
  for (const zone of zones) index.insert(ringBBox(zone.outer), zone);
  return buildings.map((building) => {
    const zone = zoneAtBuilding(index, building);
    const zoneCode = zone?.code ?? null;
    let next = applyFallbackHeightFromZone(building, zoneCode);
    if (zone) {
      next = {
        ...next,
        zoneCode: zone.code,
        ...(zone.description ? { zoneDescription: zone.description } : {}),
      };
    }
    if (next.source !== "none") return next;
    if (!zoneCode) return next;
    const use = useFromZone(zoneCode, next.height);
    if (!use) return next;
    return { ...next, use, source: "zone" as const };
  });
}

export function assignExternalUses(buildings: BuildingFeat[], zones: ZonePolygon[] | null): BuildingFeat[] {
  if (!zones || zones.length === 0) return buildings;
  return applyZones(buildings, zones);
}

export async function refineBuildingUses(
  buildings: BuildingFeat[],
  origin: LonLat,
  bounds: FrameBBox,
  options: TierFetchOptions = {},
): Promise<{ buildings: BuildingFeat[]; failures: UseTierFailure[] }> {
  const loaded = await loadUseTiers(bounds, origin, options);
  return {
    buildings: assignExternalUses(buildings, loaded.zones),
    failures: loaded.failures,
  };
}
