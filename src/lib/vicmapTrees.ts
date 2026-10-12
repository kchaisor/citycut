import { toLocal } from "./geo";
import { finishTreeSize, invalidPositive, logDroppedTreeValues } from "./trees";
import {
  errorText,
  fetchTreePage,
  readTreePageWithRetry,
  TREE_PAGE_RETRY_MS,
  TREE_PAGE_TIMEOUT_MS,
  TreeSourceHttpError,
  type TreeSourceResult,
} from "./treeSourceFetch";
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

/**
 * Every Vicmap page for the frame, in OBJECTID order. Each page has its own time limit
 * ({@link TREE_PAGE_TIMEOUT_MS}) and one retry on a transient failure; when a later page fails, the pages already read are kept and
 * the result says the tier is incomplete. Nothing loaded is an error, never a silent zero.
 */
export async function fetchVicmapTreesDetailed(
  bounds: BBox,
  signal?: AbortSignal,
  pageTimeoutMs = TREE_PAGE_TIMEOUT_MS,
  retryMs = TREE_PAGE_RETRY_MS,
): Promise<TreeSourceResult<VicmapPoint>> {
  const points: VicmapPoint[] = [];
  let dropped = 0;
  let offset = 0;
  let pages = 0;
  let error: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const json = await readTreePageWithRetry(async () => {
        const response = await fetchTreePage(
          vicmapPageUrl(bounds, offset),
          { headers: { Accept: "application/json" } },
          "Vicmap tree points",
          signal,
          pageTimeoutMs,
        );
        if (!response.ok) {
          throw new TreeSourceHttpError(`Vicmap tree points answered ${response.status}.`, response.status);
        }
        const body = (await response.json()) as { error?: { message?: string; details?: string[] } };
        if (body.error) {
          const detail = body.error.message || body.error.details?.join(" ") || "";
          throw new Error(`Vicmap tree points could not be queried.${detail ? ` ${detail}` : ""}`);
        }
        return body;
      }, signal, retryMs);
      const parsed = parseVicmapPage(json);
      points.push(...parsed.points);
      dropped += parsed.dropped;
      pages += 1;
      const next = nextVicmapOffset(offset, parsed);
      if (next === null) break;
      offset = next;
    } catch (err) {
      if (signal?.aborted) throw err;
      error = errorText(err, "Vicmap tree points could not be loaded.");
      break;
    }
  }
  logDroppedTreeValues(dropped, "Vicmap");
  const partial = error !== null && pages > 0;
  if (error !== null) {
    error = partial
      ? `Vicmap tree points are incomplete: ${pages} page${pages === 1 ? "" : "s"} (${points.length} points) loaded, then ${error}`
      : `Vicmap tree points could not be loaded, so that tier is missing. ${error}`;
  }
  return { rows: points, error, partial };
}

/** Every Vicmap point for the frame. Throws when nothing loaded; a partial load returns what arrived. */
export async function fetchVicmapTrees(bounds: BBox, signal?: AbortSignal): Promise<VicmapPoint[]> {
  const result = await fetchVicmapTreesDetailed(bounds, signal);
  if (result.error && !result.partial) throw new Error(result.error);
  return result.rows;
}

export function vicmapPointsToTrees(
  points: VicmapPoint[],
  origin: LonLat,
  sideM: number,
  frameShape: import("./siteFrame").SiteFrameShape = "square",
): TreeFeat[] {
  const half = sideM / 2;
  const trees: TreeFeat[] = [];
  points.forEach((point, index) => {
    const at = toLocal(point.lat, point.lon, origin);
    const margin = 0.2;
    if (frameShape === "square") {
      if (Math.abs(at[0]) > half + margin || Math.abs(at[1]) > half + margin) return;
    } else if (at[0] * at[0] + at[1] * at[1] > (half + margin) ** 2) return;
    const sized = finishTreeSize({
      height: point.height_m,
      crown: point.dense && point.crown_m === null ? (point.height_m ?? 10) * 0.75 : point.crown_m,
      trunk: null,
      crownMeasured: point.crown_m !== null,
      trunkMeasured: false,
      sizeSource: "vicmap",
    });
    trees.push({
      id: index + 1,
      at,
      ...sized,
      tier: "vicmap",
    });
  });
  return trees;
}
