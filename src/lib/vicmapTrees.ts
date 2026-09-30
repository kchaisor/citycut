import { toLocal } from "./geo";
import { finishTreeSize, invalidPositive, logDroppedTreeValues } from "./trees";
import type { LonLat, TreeFeat } from "../types";

/**
 * Vicmap Vegetation Tree Urban, hosted by the Vicmap ArcGIS organisation
 * (Department of Transport and Planning). Creative Commons Attribution 4.0.
 * https://discover.data.vic.gov.au/dataset/vicmap-vegetation-tree-urban-point
 *
 * A page of 2,000 points as GeoJSON, with only height, canopy radius, and
 * dense_canopy, at six decimal places, is about 316 KB. The same page as
 * protocol buffers is about 80 KB and would need a protobuf decoder.
 */
export const VICMAP_TREES_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Vegetation_Tree_Urban/FeatureServer/0";

export const VICMAP_PAGE_SIZE = 2000;
export const VICMAP_ATTRIBUTION =
  "Vicmap Vegetation Tree Urban © State of Victoria (Department of Transport and Planning), CC BY 4.0.";

const DENSE_ARCHETYPE = "broadleaf-round";
const OPEN_ARCHETYPE = "generic";
const MAX_PAGES = 12;

export type VicmapPoint = {
  lat: number;
  lon: number;
  height_m: number;
  /** Crown diameter in metres when the radius was a positive number. */
  crown_m: number | null;
  dense: boolean;
};

type BBox = { south: number; west: number; north: number; east: number };

type GeoFeature = {
  geometry?: { type?: string; coordinates?: number[] } | null;
  properties?: {
    height_m?: unknown;
    canopy_radius_m?: unknown;
    dense_canopy?: unknown;
  } | null;
};

type GeoCollection = {
  type?: string;
  exceededTransferLimit?: boolean;
  properties?: { exceededTransferLimit?: boolean };
  features?: GeoFeature[];
};

export function vicmapPageUrl(bounds: BBox, offset: number): string {
  const geometry = JSON.stringify({
    xmin: bounds.west,
    ymin: bounds.south,
    xmax: bounds.east,
    ymax: bounds.north,
  });
  const params = new URLSearchParams({
    where: "1=1",
    geometry,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "height_m,canopy_radius_m,dense_canopy",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    orderByFields: "OBJECTID",
    resultRecordCount: String(VICMAP_PAGE_SIZE),
    resultOffset: String(offset),
    f: "geojson",
  });
  return `${VICMAP_TREES_URL}/query?${params.toString()}`;
}

function denseCanopy(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const text = value.trim().toLowerCase();
  return text === "y" || text === "yes" || text === "true" || text === "1";
}

export type VicmapPage = {
  points: VicmapPoint[];
  /** Features whose height or position could not be used, plus unusable radii. */
  dropped: number;
  count: number;
  exceeded: boolean;
};

/** One GeoJSON page. A bad height or position drops the tree. A bad radius is derived later. */
export function parseVicmapPage(json: unknown): VicmapPage {
  const collection = (json ?? {}) as GeoCollection;
  const features = Array.isArray(collection.features) ? collection.features : [];
  const points: VicmapPoint[] = [];
  let dropped = 0;
  for (const feature of features) {
    const coordinates = feature.geometry?.coordinates;
    const lon = coordinates?.[0];
    const lat = coordinates?.[1];
    const height = feature.properties?.height_m;
    const radius = feature.properties?.canopy_radius_m;
    const positioned = typeof lon === "number" && Number.isFinite(lon) && typeof lat === "number" && Number.isFinite(lat);
    if (!positioned || invalidPositive(height)) {
      dropped += 1;
      continue;
    }
    const radiusOk = !invalidPositive(radius);
    if (!radiusOk) dropped += 1;
    points.push({
      lon: lon as number,
      lat: lat as number,
      height_m: height as number,
      crown_m: radiusOk ? (radius as number) * 2 : null,
      dense: denseCanopy(feature.properties?.dense_canopy),
    });
  }
  const exceeded = Boolean(
    collection.properties?.exceededTransferLimit || collection.exceededTransferLimit,
  );
  return { points, dropped, count: features.length, exceeded };
}

/** Next resultOffset, or null when this page is the last. A full page is fetched again. */
export function nextVicmapOffset(offset: number, page: Pick<VicmapPage, "count" | "exceeded">): number | null {
  if (page.count <= 0) return null;
  if (page.count < VICMAP_PAGE_SIZE && !page.exceeded) return null;
  return offset + VICMAP_PAGE_SIZE;
}

export async function fetchVicmapTrees(bounds: BBox, signal?: AbortSignal): Promise<VicmapPoint[]> {
  const points: VicmapPoint[] = [];
  let dropped = 0;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetch(vicmapPageUrl(bounds, offset), {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Vicmap tree points answered ${response.status}.`);
    const json = (await response.json()) as { error?: { message?: string } };
    if (json.error) {
      throw new Error(json.error.message || "Vicmap tree points could not be queried.");
    }
    const parsed = parseVicmapPage(json);
    points.push(...parsed.points);
    dropped += parsed.dropped;
    const next = nextVicmapOffset(offset, parsed);
    if (next === null) break;
    offset = next;
  }
  logDroppedTreeValues(dropped, "Vicmap");
  return points;
}

export function vicmapPointsToTrees(points: VicmapPoint[], origin: LonLat, half: number): TreeFeat[] {
  const trees: TreeFeat[] = [];
  points.forEach((point, index) => {
    const at = toLocal(point.lat, point.lon, origin);
    if (Math.abs(at[0]) > half + 0.2 || Math.abs(at[1]) > half + 0.2) return;
    const archetype = point.dense ? DENSE_ARCHETYPE : OPEN_ARCHETYPE;
    const sized = finishTreeSize(
      {
        height: point.height_m,
        crown: point.crown_m,
        trunk: null,
        crownMeasured: point.crown_m !== null,
        trunkMeasured: false,
        sizeSource: "vicmap",
      },
      archetype,
    );
    trees.push({
      id: index + 1,
      at,
      ...sized,
      tier: "vicmap",
      archetype,
    });
  });
  return trees;
}
