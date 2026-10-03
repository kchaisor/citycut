import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { clampBuildingHeight } from "./height";
import { openRing, signedArea, toLocal } from "./geo";
import type { BuildingFeat, LonLat, Pt, Ring } from "../types";

/**
 * City of Melbourne "2023 Building Footprints".
 * https://data.melbourne.vic.gov.au/explore/dataset/2023-building-footprints/
 * CC BY 4.0. `structure_extrusion` is the building height in metres.
 */
export const COM_BUILDINGS_ENDPOINT =
  "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/2023-building-footprints/records";

export const COM_BUILDING_HEIGHT_ATTRIBUTION =
  "2023 Building Footprints © City of Melbourne (CC BY 4.0).";

const PAGE = 100;
const MAX_PAGES = 80;

/** Padded City of Melbourne extent. Outside this the inventory has no rows. */
export const COM_CITY_EXTENT = { south: -37.86, west: 144.89, north: -37.77, east: 145.0 };

export type BBox = { south: number; west: number; north: number; east: number };

export type ComBuildingFootprint = {
  id: string;
  ring: Ring;
  holes: Ring[];
  height_m: number;
};

type ClipFns = {
  intersection: (geom: Polygon | MultiPolygon, ...more: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.intersection === "function") return loaded;
  if (loaded.default && typeof loaded.default.intersection === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { intersection } = clippingFns();

const footprintCache = new Map<string, ComBuildingFootprint[]>();

function cacheKey(bounds: BBox): string {
  return [bounds.south, bounds.west, bounds.north, bounds.east].map((v) => v.toFixed(6)).join(",");
}

export function intersectsComCity(bounds: BBox): boolean {
  return !(
    bounds.north < COM_CITY_EXTENT.south ||
    bounds.south > COM_CITY_EXTENT.north ||
    bounds.east < COM_CITY_EXTENT.west ||
    bounds.west > COM_CITY_EXTENT.east
  );
}

type GeoShape = {
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: number[][][] | number[][][][];
  };
};

type ApiRow = {
  structure_id?: string;
  structure_extrusion?: number | null;
  geo_shape?: GeoShape;
};

function ringFromLonLat(coords: number[][], origin: LonLat): Ring {
  return openRing(coords.map(([lon, lat]) => toLocal(lat, lon, origin)));
}

function footprintFromRow(row: ApiRow, origin: LonLat): ComBuildingFootprint | null {
  const height = row.structure_extrusion;
  if (typeof height !== "number" || !(height > 0)) return null;
  const geom = row.geo_shape?.geometry;
  if (!geom?.coordinates) return null;
  const id = row.structure_id?.trim() || "";
  if (geom.type === "Polygon") {
    const rings = geom.coordinates as number[][][];
    if (!rings[0]?.length) return null;
    return {
      id,
      ring: ringFromLonLat(rings[0], origin),
      holes: rings.slice(1).map((hole) => ringFromLonLat(hole, origin)),
      height_m: clampBuildingHeight(height),
    };
  }
  if (geom.type === "MultiPolygon") {
    const parts = geom.coordinates as number[][][][];
    let best: ComBuildingFootprint | null = null;
    let bestArea = 0;
    for (const poly of parts) {
      if (!poly[0]?.length) continue;
      const ring = ringFromLonLat(poly[0], origin);
      const area = Math.abs(signedArea(ring));
      if (area > bestArea) {
        bestArea = area;
        best = {
          id,
          ring,
          holes: poly.slice(1).map((hole) => ringFromLonLat(hole, origin)),
          height_m: clampBuildingHeight(height),
        };
      }
    }
    return best;
  }
  return null;
}

function toClipPolygon(ring: Ring, holes: Ring[]): Polygon {
  return [ring.map(([x, y]) => [x, y] as [number, number]), ...holes.map((hole) => hole.map(([x, y]) => [x, y] as [number, number]))];
}

function multiPolygonArea(multi: MultiPolygon): number {
  let area = 0;
  for (const poly of multi) {
    if (!poly[0]?.length) continue;
    let a = Math.abs(signedArea(poly[0] as Ring));
    for (const hole of poly.slice(1)) {
      a -= Math.abs(signedArea(hole as Ring));
    }
    area += a;
  }
  return area;
}

export function intersectionAreaM2(a: { ring: Ring; holes: Ring[] }, b: { ring: Ring; holes: Ring[] }): number {
  try {
    const result = intersection(toClipPolygon(a.ring, a.holes), toClipPolygon(b.ring, b.holes));
    return multiPolygonArea(result);
  } catch {
    return 0;
  }
}

export function centroid(ring: Ring): Pt {
  let x = 0;
  let y = 0;
  for (const [px, py] of ring) {
    x += px;
    y += py;
  }
  const n = ring.length || 1;
  return [x / n, y / n];
}

export function pointInRing(point: Pt, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pickComHeight(
  building: BuildingFeat,
  footprints: ComBuildingFootprint[],
): ComBuildingFootprint | null {
  let best: ComBuildingFootprint | null = null;
  let bestArea = 0;
  const center = centroid(building.ring);
  for (const footprint of footprints) {
    const overlap = intersectionAreaM2(building, footprint);
    if (overlap > bestArea) {
      bestArea = overlap;
      best = footprint;
      continue;
    }
    if (overlap === 0 && bestArea === 0 && pointInRing(center, footprint.ring)) {
      best = footprint;
    }
  }
  return best;
}

export function applyComBuildingHeights(
  buildings: BuildingFeat[],
  footprints: ComBuildingFootprint[],
): { buildings: BuildingFeat[]; updated: number } {
  if (footprints.length === 0) return { buildings, updated: 0 };
  let updated = 0;
  const out = buildings.map((building) => {
    const match = pickComHeight(building, footprints);
    if (!match || Math.abs(match.height_m - building.height) < 0.05) return building;
    updated += 1;
    return { ...building, height: match.height_m };
  });
  return { buildings: out, updated };
}

async function readPage(bounds: BBox, offset: number, signal?: AbortSignal): Promise<ApiRow[]> {
  const params = new URLSearchParams({
    limit: String(PAGE),
    offset: String(offset),
    geofilter: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [bounds.west, bounds.south],
          [bounds.east, bounds.south],
          [bounds.east, bounds.north],
          [bounds.west, bounds.north],
          [bounds.west, bounds.south],
        ],
      ],
    }),
  });
  const response = await fetch(`${COM_BUILDINGS_ENDPOINT}?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`City of Melbourne building records answered ${response.status}.`);
  const json = (await response.json()) as { results?: ApiRow[] };
  return json.results ?? [];
}

export async function fetchComBuildingFootprints(
  bounds: BBox,
  origin: LonLat,
  signal?: AbortSignal,
): Promise<ComBuildingFootprint[]> {
  if (!intersectsComCity(bounds)) return [];
  const key = cacheKey(bounds);
  const cached = footprintCache.get(key);
  if (cached) return cached;

  const rows: ApiRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await readPage(bounds, page * PAGE, signal);
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const footprints: ComBuildingFootprint[] = [];
  for (const row of rows) {
    const footprint = footprintFromRow(row, origin);
    if (footprint) footprints.push(footprint);
  }
  footprintCache.set(key, footprints);
  return footprints;
}

/** @internal test helper */
export function clearComBuildingFootprintCache(): void {
  footprintCache.clear();
}
