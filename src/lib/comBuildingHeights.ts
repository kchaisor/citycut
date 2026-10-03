import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { clampBuildingHeight } from "./height";
import { openRing, signedArea, toLocal } from "./geo";
import type { BuildingFeat, LonLat, Pt, Ring } from "../types";
import type { BuildingExtrusionPart as ExtrusionPart } from "../types";

/**
 * City of Melbourne "2023 Building Footprints".
 * https://data.melbourne.vic.gov.au/explore/dataset/2023-building-footprints/
 * CC BY 4.0. `structure_extrusion` is the building height in metres.
 */
export const COM_BUILDINGS_DATASET =
  "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/2023-building-footprints";

export const COM_BUILDING_HEIGHT_ATTRIBUTION =
  "2023 Building Footprints © City of Melbourne (CC BY 4.0).";

const EXPORT_LIMIT = 8000;

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
  difference: (subject: Polygon | MultiPolygon, ...clips: Array<Polygon | MultiPolygon>) => MultiPolygon;
  union: (...geoms: Array<Polygon | MultiPolygon>) => MultiPolygon;
};

function clippingFns(): ClipFns {
  const loaded = polygonClipping as unknown as ClipFns & { default?: ClipFns };
  if (typeof loaded.intersection === "function") return loaded;
  if (loaded.default && typeof loaded.default.intersection === "function") return loaded.default;
  throw new Error("polygon-clipping did not load.");
}

const { intersection, difference, union } = clippingFns();

export const COM_SLIVER_MIN_M2 = 2;
export const COM_SLIVER_MIN_FRACTION = 0.05;
export const COM_FALLBACK_MIN_FRACTION = 0.2;

const footprintCache = new Map<string, ComBuildingFootprint[]>();

function cacheKey(bounds: BBox, origin: LonLat): string {
  return ["clip-v2", bounds.south, bounds.west, bounds.north, bounds.east, origin.lat, origin.lon]
    .map((v) => (typeof v === "number" ? v.toFixed(6) : v))
    .join(",");
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
  geo_point_2d?: { lat: number; lon: number };
};

type GeoJsonFeature = {
  type?: string;
  geometry?: GeoShape["geometry"];
  properties?: ApiRow;
};

function ringFromLonLat(coords: number[][], origin: LonLat): Ring {
  return openRing(coords.map(([lon, lat]) => toLocal(lat, lon, origin)));
}

function footprintsFromGeometry(
  row: ApiRow,
  geom: NonNullable<GeoShape["geometry"]>,
  origin: LonLat,
): ComBuildingFootprint[] {
  const height = row.structure_extrusion;
  if (typeof height !== "number" || !(height > 0)) return [];
  if (!geom.coordinates) return [];
  const id = row.structure_id?.trim() || "";
  const height_m = clampBuildingHeight(height);
  const out: ComBuildingFootprint[] = [];
  if (geom.type === "Polygon") {
    const rings = geom.coordinates as number[][][];
    if (!rings[0]?.length) return [];
    out.push({
      id,
      ring: ringFromLonLat(rings[0], origin),
      holes: rings.slice(1).map((hole) => ringFromLonLat(hole, origin)),
      height_m,
    });
    return out;
  }
  if (geom.type === "MultiPolygon") {
    const parts = geom.coordinates as number[][][][];
    for (const poly of parts) {
      if (!poly[0]?.length) continue;
      out.push({
        id,
        ring: ringFromLonLat(poly[0], origin),
        holes: poly.slice(1).map((hole) => ringFromLonLat(hole, origin)),
        height_m,
      });
    }
  }
  return out;
}

function footprintsFromFeature(feature: GeoJsonFeature, origin: LonLat): ComBuildingFootprint[] {
  const props = feature.properties ?? {};
  const geom = feature.geometry;
  if (!geom?.coordinates) return [];
  return footprintsFromGeometry(props, geom, origin);
}

function closeRingForClip(ring: Ring): [number, number][] {
  const pts = ring.map(([x, y]) => [x, y] as [number, number]);
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  if (Math.hypot(ax - bx, ay - by) > 1e-9) pts.push([ax, ay]);
  return pts;
}

function toClipPolygon(ring: Ring, holes: Ring[]): Polygon {
  return [
    closeRingForClip(ring),
    ...holes.map((hole) => closeRingForClip(hole)),
  ];
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

/** Tallest CoM part with ≥20% overlap on OSM or on the CoM part (fallback when clip fails). */
export function pickComHeightFallback20(
  building: BuildingFeat,
  footprints: ComBuildingFootprint[],
): ComBuildingFootprint | null {
  const osmArea = Math.abs(signedArea(openRing(building.ring)));
  if (osmArea <= 0) return null;
  let best: ComBuildingFootprint | null = null;
  let bestHeight = 0;
  for (const footprint of footprints) {
    const overlap = intersectionAreaM2(building, footprint);
    if (overlap <= 0) continue;
    const comArea = Math.abs(signedArea(openRing(footprint.ring)));
    const osmShare = overlap / osmArea;
    const comShare = comArea > 0 ? overlap / comArea : 0;
    if (osmShare < COM_FALLBACK_MIN_FRACTION && comShare < COM_FALLBACK_MIN_FRACTION) continue;
    if (footprint.height_m > bestHeight) {
      bestHeight = footprint.height_m;
      best = footprint;
    }
  }
  return best;
}

function polygonAreaM2(poly: Polygon): number {
  if (!poly[0]?.length) return 0;
  let a = Math.abs(signedArea(poly[0] as Ring));
  for (const hole of poly.slice(1)) {
    a -= Math.abs(signedArea(hole as Ring));
  }
  return Math.max(0, a);
}

function isSliver(area: number, referenceArea: number): boolean {
  return area < COM_SLIVER_MIN_M2 || area < COM_SLIVER_MIN_FRACTION * referenceArea;
}

function partsFromMultiPolygon(
  multi: MultiPolygon,
  height: number,
  referenceArea: number,
  filterSlivers: boolean,
): ExtrusionPart[] {
  const parts: ExtrusionPart[] = [];
  for (const poly of multi) {
    const area = polygonAreaM2(poly);
    if (filterSlivers && isSliver(area, referenceArea)) continue;
    if (!poly[0]?.length) continue;
    parts.push({
      ring: openRing(poly[0] as Ring),
      holes: poly.slice(1).map((hole) => openRing(hole as Ring)),
      height,
    });
  }
  return parts;
}

function osmClipPolygon(building: BuildingFeat): Polygon {
  return toClipPolygon(building.ring, building.holes);
}

/** Clip one OSM footprint against CoM parts; OSM-height remainder fills gaps. */
export function clipBuildingComExtrusions(
  building: BuildingFeat,
  footprints: ComBuildingFootprint[],
): ExtrusionPart[] | null {
  const osmArea = Math.abs(signedArea(openRing(building.ring)));
  if (osmArea <= 0 || footprints.length === 0) return null;

  try {
    const osmPoly = osmClipPolygon(building);
    const comParts: ExtrusionPart[] = [];
    const comUnionInputs: Polygon[] = [];

    for (const footprint of footprints) {
      const inter = intersection(osmPoly, toClipPolygon(footprint.ring, footprint.holes));
      const area = multiPolygonArea(inter);
      if (area <= 0) continue;
      for (const poly of inter) {
        if (!poly[0]?.length) continue;
        comUnionInputs.push(poly as Polygon);
      }
      comParts.push(...partsFromMultiPolygon(inter, footprint.height_m, osmArea, true));
    }

    if (comParts.length === 0) return null;

    let remainderParts: ExtrusionPart[] = [];
    if (comUnionInputs.length > 0) {
      const covered = comUnionInputs.length === 1 ? comUnionInputs[0] : union(...comUnionInputs);
      const remainder = difference(osmPoly, covered);
      remainderParts = partsFromMultiPolygon(remainder, building.height, osmArea, true);
    }

    return [...comParts, ...remainderParts];
  } catch {
    const fallback = pickComHeightFallback20(building, footprints);
    if (!fallback) return null;
    return [
      {
        ring: building.ring,
        holes: building.holes,
        height: fallback.height_m,
      },
    ];
  }
}

export function tallestExtrusionHeight(building: BuildingFeat): number {
  if (building.extrusionParts?.length) {
    return Math.max(...building.extrusionParts.map((part) => part.height));
  }
  return building.height;
}

export function applyComBuildingHeights(
  buildings: BuildingFeat[],
  footprints: ComBuildingFootprint[],
): { buildings: BuildingFeat[]; updated: number } {
  if (footprints.length === 0) return { buildings, updated: 0 };
  let updated = 0;
  const out = buildings.map((building) => {
    const parts = clipBuildingComExtrusions(building, footprints);
    if (!parts || parts.length === 0) return building;
    const hadCom = parts.some((part) => Math.abs(part.height - building.height) > 0.05);
    const prevMax = tallestExtrusionHeight(building);
    const nextMax = Math.max(...parts.map((p) => p.height));
    if (!hadCom && Math.abs(nextMax - prevMax) < 0.05 && parts.length === 1) return building;
    updated += 1;
    return { ...building, extrusionParts: parts };
  });
  return { buildings: out, updated };
}

export type ComClipStats = { clipMs: number; extrusionMeshCount: number };

export function applyComBuildingHeightsWithStats(
  buildings: BuildingFeat[],
  footprints: ComBuildingFootprint[],
): { buildings: BuildingFeat[]; updated: number; stats: ComClipStats } {
  const t0 = performance.now();
  const result = applyComBuildingHeights(buildings, footprints);
  const clipMs = performance.now() - t0;
  let extrusionMeshCount = 0;
  for (const building of result.buildings) {
    extrusionMeshCount += building.extrusionParts?.length ?? 1;
  }
  return { ...result, stats: { clipMs, extrusionMeshCount } };
}

function rowInBounds(row: ApiRow, bounds: BBox): boolean {
  const point = row.geo_point_2d;
  if (!point || typeof point.lat !== "number" || typeof point.lon !== "number") return false;
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lon >= bounds.west &&
    point.lon <= bounds.east
  );
}

export async function fetchComBuildingFootprints(
  bounds: BBox,
  origin: LonLat,
  signal?: AbortSignal,
): Promise<ComBuildingFootprint[]> {
  if (!intersectsComCity(bounds)) return [];
  const key = cacheKey(bounds, origin);
  const cached = footprintCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    limit: String(EXPORT_LIMIT),
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
  const exportUrl = `${COM_BUILDINGS_DATASET}/exports/geojson?${params.toString()}`;
  const response = await fetch(exportUrl, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`City of Melbourne building export answered ${response.status}.`);
  const json = (await response.json()) as { features?: GeoJsonFeature[] };
  const footprints: ComBuildingFootprint[] = [];
  for (const feature of json.features ?? []) {
    footprints.push(...footprintsFromFeature(feature, origin));
  }
  footprintCache.set(key, footprints);
  return footprints;
}

/** @internal test helper */
export function clearComBuildingFootprintCache(): void {
  footprintCache.clear();
}
