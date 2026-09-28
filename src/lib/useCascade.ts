import { useFromClue, useFromHeuristic, useFromZone, usesFromPoi, voteClue, votePoi } from "./buildingUse";
import { openRing, signedArea, toLocal } from "./geo";
import type { OverpassElement } from "./overpass";
import type { BuildingFeat, BuildingUse, LonLat, Pt, UseTierFailure } from "../types";

export type FrameBBox = { south: number; west: number; north: number; east: number };

/** Padded City of Melbourne extent. CLUE is only requested when the frame meets this box. */
export const CITY_OF_MELBOURNE_BBOX: FrameBBox = {
  south: -37.86,
  west: 144.89,
  north: -37.77,
  east: 145,
};

export const TIER_TIMEOUT_MS = 15_000;
const CLUE_LIMIT = 5000;
const ZONE_LIMIT = 2000;

const CLUE_DATASET = "buildings-with-name-age-size-accessibility-and-bicycle-facilities";

export type PoiFeat = { at: Pt; votes: BuildingUse[] };
export type LandFeat = { ring: Pt[]; holes: Pt[][]; use: BuildingUse; area: number };
export type CluePoint = { lat: number; lon: number; spaceUse: string };
export type ZonePolygon = { code: string; outer: Pt[]; holes: Pt[][]; area: number };

type BBox2 = { minX: number; minY: number; maxX: number; maxY: number };

export function bboxesIntersect(a: FrameBBox, b: FrameBBox): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

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

  queryBox(bbox: BBox2): T[] {
    const x0 = Math.floor(bbox.minX / this.cell);
    const x1 = Math.floor(bbox.maxX / this.cell);
    const y0 = Math.floor(bbox.minY / this.cell);
    const y1 = Math.floor(bbox.maxY / this.cell);
    const seen = new Set<T>();
    const found: T[] = [];
    const push = (item: T) => {
      if (seen.has(item)) return;
      seen.add(item);
      found.push(item);
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const bucket = this.buckets.get(`${x}:${y}`);
        if (bucket) bucket.forEach(push);
      }
    }
    this.overflow.forEach(push);
    return found;
  }
}

function pending(buildings: BuildingFeat[]): boolean {
  return buildings.some((building) => building.source === "none");
}

/** POI nodes inside the footprint, otherwise the landuse polygon under the centroid. */
export function applyOsmContext(
  buildings: BuildingFeat[],
  pois: PoiFeat[],
  landuse: LandFeat[],
): BuildingFeat[] {
  if (!pending(buildings) || (pois.length === 0 && landuse.length === 0)) return buildings;
  const poiIndex = new GridIndex<PoiFeat>(48);
  for (const poi of pois) poiIndex.insert(ringBBox([poi.at, poi.at]), poi);
  const landIndex = new GridIndex<LandFeat>(80);
  for (const poly of landuse) landIndex.insert(ringBBox(poly.ring), poly);

  return buildings.map((building) => {
    if (building.source !== "none") return building;
    const box = ringBBox(building.ring);
    const votes = poiIndex
      .queryBox(box)
      .filter((poi) => pointInPolygon(poi.at, building.ring, building.holes))
      .flatMap((poi) => poi.votes);
    const fromPoi = votePoi(votes);
    if (fromPoi) return { ...building, use: fromPoi, source: "osm_poi" as const };
    const at = interiorPoint(building.ring, building.holes);
    const covers = landIndex
      .queryPoint(at)
      .filter((poly) => pointInPolygon(at, poly.ring, poly.holes))
      .sort((a, b) => a.area - b.area);
    if (covers.length > 0) return { ...building, use: covers[0].use, source: "osm_poi" as const };
    return building;
  });
}

export function collectOsmUseFeatures(
  elements: OverpassElement[],
  origin: LonLat,
): { pois: PoiFeat[]; landuse: LandFeat[] } {
  const pois: PoiFeat[] = [];
  const landuse: LandFeat[] = [];
  for (const element of elements) {
    if (element.type !== "node" || element.lat === undefined || element.lon === undefined) continue;
    const votes = usesFromPoi(element.tags ?? {});
    if (votes.length === 0) continue;
    pois.push({ at: toLocal(element.lat, element.lon, origin), votes });
  }
  return { pois, landuse };
}

export function landFeature(ring: Pt[], holes: Pt[][], use: BuildingUse): LandFeat | null {
  if (ring.length < 4) return null;
  const area = footprintArea(ring, holes);
  if (area < 1) return null;
  return { ring, holes, use, area };
}

/**
 * One CLUE request. `census_year` is selected so the newest year in the
 * response can be kept without a second query and without hard-coding 2024.
 * `in_bbox` is lat1,lon1,lat2,lon2.
 */
export function clueExportUrl(bounds: FrameBBox): string {
  const where = `in_bbox(location,${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const url = new URL(
    `https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/${CLUE_DATASET}/exports/json`,
  );
  url.searchParams.set("select", "predominant_space_use,latitude,longitude,census_year");
  url.searchParams.set("where", where);
  url.searchParams.set("order_by", "census_year desc");
  url.searchParams.set("limit", String(CLUE_LIMIT));
  return url.toString();
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
  url.searchParams.set("propertyName", "zone_code,geom");
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

function censusYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== "string") return null;
  const match = value.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function parseClue(body: unknown): CluePoint[] {
  if (!Array.isArray(body)) return [];
  const rows = body.slice(0, CLUE_LIMIT).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as {
      predominant_space_use?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      census_year?: unknown;
    };
    const lat = Number(record.latitude);
    const lon = Number(record.longitude);
    const spaceUse = typeof record.predominant_space_use === "string" ? record.predominant_space_use : "";
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [{ lat, lon, spaceUse, year: censusYear(record.census_year) }];
  });
  let max = -Infinity;
  for (const row of rows) if (row.year !== null && row.year > max) max = row.year;
  const kept = Number.isFinite(max) && max > 0 ? rows.filter((row) => row.year === max) : rows;
  return kept.map(({ lat, lon, spaceUse }) => ({ lat, lon, spaceUse }));
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

function polygonsFromGeometry(geometry: unknown, origin: LonLat, code: string): ZonePolygon[] {
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
    parsed.push({ code, outer, holes, area: footprintArea(outer, holes) });
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
    const record = feature as { properties?: { zone_code?: unknown }; geometry?: unknown };
    const code = record.properties?.zone_code;
    if (typeof code !== "string" || !code.trim()) continue;
    polygons.push(...polygonsFromGeometry(record.geometry, origin, code.trim()));
  }
  return polygons;
}

function tierFailure(tier: "clue" | "zone"): UseTierFailure {
  return { tier, message: tier === "zone" ? "zones unavailable" : "clue unavailable" };
}

export type LoadedTiers = {
  clue: CluePoint[] | null;
  zones: ZonePolygon[] | null;
  failures: UseTierFailure[];
};

/** One request per source. A failed tier is skipped. No retries. */
export async function loadUseTiers(
  bounds: FrameBBox,
  origin: LonLat,
  options: TierFetchOptions = {},
): Promise<LoadedTiers> {
  const wantClue = bboxesIntersect(bounds, CITY_OF_MELBOURNE_BBOX);
  const [clueBody, zoneBody] = await Promise.all([
    wantClue ? fetchTierJson(clueExportUrl(bounds), options) : Promise.resolve(null),
    fetchTierJson(zoneWfsUrl(bounds), options),
  ]);
  const failures: UseTierFailure[] = [];
  let clue: CluePoint[] | null = null;
  let zones: ZonePolygon[] | null = null;
  if (wantClue) {
    if (clueBody && clueBody.ok) clue = parseClue(clueBody.body);
    else {
      failures.push(tierFailure("clue"));
      clue = null;
    }
  }
  if (zoneBody.ok) zones = parseZones(zoneBody.body, origin);
  else {
    failures.push(tierFailure("zone"));
    zones = null;
  }
  return { clue, zones, failures };
}

function applyClue(buildings: BuildingFeat[], origin: LonLat, points: CluePoint[]): BuildingFeat[] {
  const open = buildings.map((building, index) => ({ building, index, area: footprintArea(building.ring, building.holes) }));
  const index = new GridIndex<(typeof open)[number]>(48);
  for (const item of open) {
    if (item.building.source !== "none") continue;
    index.insert(ringBBox(item.building.ring), item);
  }
  const votes = buildings.map(() => [] as BuildingUse[]);
  for (const point of points) {
    const at = toLocal(point.lat, point.lon, origin);
    let best: (typeof open)[number] | null = null;
    for (const item of index.queryPoint(at)) {
      if (!pointInPolygon(at, item.building.ring, item.building.holes)) continue;
      if (!best || item.area < best.area) best = item;
    }
    if (!best) continue;
    const use = useFromClue(point.spaceUse);
    if (use) votes[best.index].push(use);
  }
  return buildings.map((building, i) => {
    if (building.source !== "none") return building;
    const use = voteClue(votes[i]);
    if (!use) return building;
    return { ...building, use, source: "clue" as const };
  });
}

function applyZones(buildings: BuildingFeat[], zones: ZonePolygon[]): BuildingFeat[] {
  const index = new GridIndex<ZonePolygon>(80);
  for (const zone of zones) index.insert(ringBBox(zone.outer), zone);
  return buildings.map((building) => {
    if (building.source !== "none") return building;
    const at = interiorPoint(building.ring, building.holes);
    const covers = index
      .queryPoint(at)
      .filter((zone) => pointInPolygon(at, zone.outer, zone.holes))
      .sort((a, b) => a.area - b.area);
    if (covers.length === 0) return building;
    const use = useFromZone(covers[0].code, building.height);
    if (!use) return building;
    return { ...building, use, source: "zone" as const };
  });
}

function applyHeuristic(building: BuildingFeat): BuildingFeat {
  if (building.source !== "none") return building;
  const use = useFromHeuristic(footprintArea(building.ring, building.holes), building.height);
  if (!use) return building;
  return { ...building, use, source: "heuristic" };
}

export function assignExternalUses(
  buildings: BuildingFeat[],
  origin: LonLat,
  loaded: { clue: CluePoint[] | null; zones: ZonePolygon[] | null },
): BuildingFeat[] {
  let next = buildings;
  if (loaded.clue && loaded.clue.length > 0) next = applyClue(next, origin, loaded.clue);
  if (loaded.zones && loaded.zones.length > 0) next = applyZones(next, loaded.zones);
  return next.map(applyHeuristic);
}

export async function refineBuildingUses(
  buildings: BuildingFeat[],
  origin: LonLat,
  bounds: FrameBBox,
  options: TierFetchOptions = {},
): Promise<{ buildings: BuildingFeat[]; failures: UseTierFailure[] }> {
  const loaded = await loadUseTiers(bounds, origin, options);
  return {
    buildings: assignExternalUses(buildings, origin, loaded),
    failures: loaded.failures,
  };
}
