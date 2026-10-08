/**
 * Offline building use + LiDAR height attributes served as PMTiles on GitHub Pages.
 * Geometry matches Overture building ids at z14; the app joins on {@link BuildingFeat.overtureId}.
 */

import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { sharedPmtilesForAbsoluteUrl } from "./registerPmtilesProtocol";
import type { BuildingUse, BuildingUseSourceTier } from "../types";

export const ENRICHMENT_TILE_ZOOM = 14;
const DEFAULT_PMTILES_URL = `${import.meta.env.BASE_URL}building-enrichment.pmtiles`;
const MANIFEST_URL = `${import.meta.env.BASE_URL}building-enrichment-manifest.json`;

let cachedPmtilesUrl: string | null = null;

async function resolveEnrichmentPmtilesUrl(signal?: AbortSignal): Promise<string> {
  if (cachedPmtilesUrl) return cachedPmtilesUrl;
  const manifest = await fetchEnrichmentManifest(signal);
  const url =
    manifest?.pmtilesUrl && manifest.pmtilesUrl.startsWith("http")
      ? manifest.pmtilesUrl
      : DEFAULT_PMTILES_URL;
  cachedPmtilesUrl = url;
  return url;
}

/** Absolute HTTP(S) URL for MapLibre `pmtiles://` sources (manifest override or bundled path). */
export async function getEnrichmentPmtilesAbsoluteUrl(signal?: AbortSignal): Promise<string> {
  const path = await resolveEnrichmentPmtilesUrl(signal);
  if (path.startsWith("http")) return path;
  if (typeof window !== "undefined") {
    return new URL(path, window.location.href).href;
  }
  return path;
}

export type BuildingEnrichmentRecord = {
  overtureId: string;
  use: BuildingUse;
  useSource: BuildingUseSourceTier;
  heightM: number | null;
  heightSource: string | null;
  zoneCode: string | null;
};

const USE_FROM_CODE: Record<number, BuildingUse> = {
  0: "unclassified",
  1: "residential",
  2: "commercial",
  3: "retail",
  4: "mixed_use",
  5: "industrial",
  6: "civic",
  7: "recreation",
  8: "outbuilding",
};

const SOURCE_FROM_CODE: Record<number, BuildingUseSourceTier> = {
  0: "unclassified",
  1: "overture",
  2: "clue",
  3: "bca",
  4: "zone",
};

export type EnrichmentManifest = {
  extent: { west: number; south: number; east: number; north: number };
  builtBbox?: { west: number; south: number; east: number; north: number };
  targetExtent?: { west: number; south: number; east: number; north: number };
  regionName?: string;
  featureCount: number;
  pmtilesBytes: number;
  generatedAt: string;
  /** When set, fetch PMTiles from this URL instead of the bundled GitHub Pages path. */
  pmtilesUrl?: string;
  lidar?: { status: string; detail?: string };
  zonesFetch?: {
    complete?: boolean;
    pagesOk?: number;
    pagesFailed?: number;
    features?: number;
    failures?: string[];
  };
  zoneDiagnostics?: {
    unclassifiedNoZoneJoin?: number;
    unclassifiedUnmappedZoneCounts?: Record<string, number>;
  };
  clueLoaded?: boolean;
  bca?: { status: string; detail?: string; url?: string };
  /** SHA-256 of canonical `shared/vicmap-zone-use.json` at bake time. */
  zoneUseTableSha256?: string;
  /** SHA-256 of canonical `shared/overture-building-use.json` at bake time. */
  overtureBuildingUseSha256?: string;
  /** Overture Maps release used for the input building fetch at bake time. */
  overtureRelease?: string;
};

function tileRange(bounds: { south: number; west: number; north: number; east: number }, z: number) {
  const n = 2 ** z;
  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);
  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const yFor = (lat: number) =>
    Math.floor(((1 - Math.log(Math.tan(latRad(lat)) + 1 / Math.cos(latRad(lat))) / Math.PI) / 2) * n);
  const yMin = Math.min(yFor(bounds.north), yFor(bounds.south));
  const yMax = Math.max(yFor(bounds.north), yFor(bounds.south));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

function parseUse(raw: unknown): BuildingUse | null {
  if (typeof raw !== "string") return null;
  const allowed = new Set([
    "residential",
    "commercial",
    "retail",
    "mixed_use",
    "industrial",
    "civic",
    "recreation",
    "outbuilding",
    "unclassified",
  ]);
  return allowed.has(raw) ? (raw as BuildingUse) : null;
}

function parseUseSource(raw: unknown): BuildingUseSourceTier | null {
  if (typeof raw !== "string") return null;
  const allowed = new Set(["overture", "clue", "bca", "zone", "unclassified"]);
  return allowed.has(raw) ? (raw as BuildingUseSourceTier) : null;
}

function recordFromProps(props: Record<string, unknown>): BuildingEnrichmentRecord | null {
  const id = typeof props.overture_id === "string" ? props.overture_id : typeof props.id === "string" ? props.id : "";
  if (!id) return null;
  let use = parseUse(props.use);
  let useSource = parseUseSource(props.use_source);
  if (!use && typeof props.u === "number") use = USE_FROM_CODE[props.u] ?? null;
  if (!useSource && typeof props.s === "number") useSource = SOURCE_FROM_CODE[props.s] ?? null;
  if (!use || !useSource) return null;
  const heightRaw = props.height_m;
  const heightM =
    typeof heightRaw === "number" && Number.isFinite(heightRaw)
      ? heightRaw
      : typeof heightRaw === "string" && Number.isFinite(Number(heightRaw))
        ? Number(heightRaw)
        : null;
  const heightSource =
    typeof props.height_source === "string" && props.height_source.trim()
      ? props.height_source.trim()
      : null;
  const zoneCode =
    typeof props.zone_code === "string" && props.zone_code.trim() ? props.zone_code.trim() : null;
  return { overtureId: id, use, useSource, heightM, heightSource, zoneCode };
}

export async function fetchEnrichmentManifest(signal?: AbortSignal): Promise<EnrichmentManifest | null> {
  try {
    const response = await fetch(MANIFEST_URL, { signal, cache: "default" });
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      console.warn(`[CityCut enrichment] manifest HTTP ${response.status}`);
      return null;
    }
    if (!response.ok) return null;
    return (await response.json()) as EnrichmentManifest;
  } catch {
    return null;
  }
}

export function isEnrichmentFetchAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

export async function fetchBuildingEnrichmentForCut(
  bounds: { south: number; west: number; north: number; east: number },
  signal?: AbortSignal,
): Promise<{ byId: Map<string, BuildingEnrichmentRecord>; error: string | null }> {
  const byId = new Map<string, BuildingEnrichmentRecord>();
  try {
    const absoluteUrl = await getEnrichmentPmtilesAbsoluteUrl(signal);
    const pmtiles = sharedPmtilesForAbsoluteUrl(absoluteUrl);
    const header = await pmtiles.getHeader();
    if (!header || header.minZoom == null) {
      return { byId, error: "Building enrichment tiles are missing or invalid." };
    }
    const tiles = tileRange(bounds, ENRICHMENT_TILE_ZOOM);
    await Promise.all(
      tiles.map(async ({ z, x, y }) => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const response = await pmtiles.getZxy(z, x, y);
        if (!response?.data) return;
        const vt = new VectorTile(new PbfReader(response.data));
        const layer = vt.layers.building_enrichment ?? vt.layers.buildings;
        if (!layer) return;
        for (let i = 0; i < layer.length; i++) {
          const feature = layer.feature(i);
          const props = feature.properties as Record<string, unknown>;
          const record = recordFromProps(props);
          if (record) byId.set(record.overtureId, record);
        }
      }),
    );
    return { byId, error: null };
  } catch (err) {
    if (isEnrichmentFetchAbort(err, signal)) throw err;
    const message =
      err instanceof Error ? err.message : "Building enrichment tiles could not be loaded.";
    console.warn(`[CityCut enrichment] ${message}`);
    return { byId, error: message };
  }
}
