import { openRing, toLocal } from "./geo";
import type { FrameBBox } from "./useCascade";
import type { LonLat, Pt } from "../types";

/** Vicmap Open Data Platform WFS (GeoServer). Bbox is minLon,minLat,maxLon,maxLat,CRS:84. */
export function vicmapWfsGetFeatureUrl(
  typeName: string,
  bounds: FrameBBox,
  options: { count?: number; propertyName?: string } = {},
): string {
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north},CRS:84`;
  const url = new URL("https://opendata.maps.vic.gov.au/geoserver/wfs");
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", typeName);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("bbox", bbox);
  if (options.propertyName) url.searchParams.set("propertyName", options.propertyName);
  if (options.count != null) url.searchParams.set("count", String(options.count));
  return url.toString();
}

function asLonLat(coord: unknown): [number, number] | null {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const a = Number(coord[0]);
  const b = Number(coord[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lon = Math.abs(a) > 90 ? a : b;
  const lat = Math.abs(a) > 90 ? b : a;
  return [lon, lat];
}

function lineFromCoords(coords: unknown, origin: LonLat): Pt[] {
  if (!Array.isArray(coords)) return [];
  const line: Pt[] = [];
  for (const coord of coords) {
    const lonLat = asLonLat(coord);
    if (!lonLat) continue;
    line.push(toLocal(lonLat[1], lonLat[0], origin));
  }
  return line;
}

function ringFromCoords(coords: unknown, origin: LonLat): Pt[] {
  return openRing(lineFromCoords(coords, origin));
}

function visitLonLatCoords(value: unknown, visit: (lon: number, lat: number) => void) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    visit(value[0], value[1]);
    return;
  }
  for (const child of value) visitLonLatCoords(child, visit);
}

/** GeoServer sometimes returns features outside a WFS bbox; drop them before clipping. */
export function geometryIntersectsBounds(geometry: unknown, bounds: FrameBBox): boolean {
  if (!geometry || typeof geometry !== "object") return false;
  let hit = false;
  visitLonLatCoords((geometry as { coordinates?: unknown }).coordinates, (lon, lat) => {
    if (
      lon >= bounds.west - 1e-9 &&
      lon <= bounds.east + 1e-9 &&
      lat >= bounds.south - 1e-9 &&
      lat <= bounds.north + 1e-9
    ) {
      hit = true;
    }
  });
  return hit;
}

export type VicmapPolygon = { outer: Pt[]; holes: Pt[][] };

export function polygonsFromGeometry(geometry: unknown, origin: LonLat): VicmapPolygon[] {
  if (!geometry || typeof geometry !== "object") return [];
  const typed = geometry as { type?: string; coordinates?: unknown };
  const multi: unknown[] =
    typed.type === "Polygon"
      ? [typed.coordinates]
      : typed.type === "MultiPolygon" && Array.isArray(typed.coordinates)
        ? typed.coordinates
        : [];
  const parsed: VicmapPolygon[] = [];
  for (const polygon of multi) {
    if (!Array.isArray(polygon) || polygon.length === 0) continue;
    const outer = ringFromCoords(polygon[0], origin);
    if (outer.length < 4) continue;
    const holes = polygon
      .slice(1)
      .map((hole) => ringFromCoords(hole, origin))
      .filter((hole) => hole.length >= 4);
    parsed.push({ outer, holes });
  }
  return parsed;
}

export function linesFromGeometry(geometry: unknown, origin: LonLat): Pt[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const typed = geometry as { type?: string; coordinates?: unknown };
  if (typed.type === "LineString" && Array.isArray(typed.coordinates)) {
    const line = lineFromCoords(typed.coordinates, origin);
    return line.length >= 2 ? [line] : [];
  }
  if (typed.type === "MultiLineString" && Array.isArray(typed.coordinates)) {
    const out: Pt[][] = [];
    for (const part of typed.coordinates) {
      const line = lineFromCoords(part, origin);
      if (line.length >= 2) out.push(line);
    }
    return out;
  }
  return [];
}

export function pointFromGeometry(geometry: unknown, origin: LonLat): Pt | null {
  if (!geometry || typeof geometry !== "object") return null;
  const typed = geometry as { type?: string; coordinates?: unknown };
  if (typed.type === "Point" && Array.isArray(typed.coordinates)) {
    const lonLat = asLonLat(typed.coordinates);
    if (!lonLat) return null;
    return toLocal(lonLat[1], lonLat[0], origin);
  }
  return null;
}

export function parseFeatureCollection(body: unknown): { geometry: unknown; properties: Record<string, unknown> }[] {
  if (!body || typeof body !== "object") return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const out: { geometry: unknown; properties: Record<string, unknown> }[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const record = feature as { geometry?: unknown; properties?: Record<string, unknown> };
    if (!record.geometry) continue;
    out.push({ geometry: record.geometry, properties: record.properties ?? {} });
  }
  return out;
}
