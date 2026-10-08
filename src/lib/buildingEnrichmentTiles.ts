/**
 * Offline building use + LiDAR height attributes served as PMTiles on GitHub Pages.
 * Geometry matches Overture building ids at z14; the app joins on {@link BuildingFeat.overtureId}.
 */

import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import type { BuildingUse, BuildingUseSourceTier } from "../types";

export const ENRICHMENT_TILE_ZOOM = 14;
const ENRICHMENT_URL = `${import.meta.env.BASE_URL}building-enrichment.pmtiles`;
const MANIFEST_URL = `${import.meta.env.BASE_URL}building-enrichment-manifest.json`;

export type BuildingEnrichmentRecord = {
  overtureId: string;
  use: BuildingUse;
  useSource: BuildingUseSourceTier;
  heightM: number | null;
  heightSource: string | null;
  zoneCode: string | null;
};

export type EnrichmentManifest = {
  extent: { west: number; south: number; east: number; north: number };
  featureCount: number;
  pmtilesBytes: number;
  generatedAt: string;
  lidar?: { status: string; detail?: string };
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
  const use = parseUse(props.use);
  const useSource = parseUseSource(props.use_source);
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

export async function fetchBuildingEnrichmentForCut(
  bounds: { south: number; west: number; north: number; east: number },
  signal?: AbortSignal,
): Promise<{ byId: Map<string, BuildingEnrichmentRecord>; error: string | null }> {
  const byId = new Map<string, BuildingEnrichmentRecord>();
  try {
    const pmtiles = new PMTiles(ENRICHMENT_URL);
    const header = await pmtiles.getHeader();
    if (!header || header.minZoom == null) {
      return { byId, error: "Building enrichment tiles are missing or invalid." };
    }
    const tiles = tileRange(bounds, ENRICHMENT_TILE_ZOOM);
    const tileResults = await Promise.all(
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
    void tileResults;
    return { byId, error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    const message =
      err instanceof Error ? err.message : "Building enrichment tiles could not be loaded.";
    console.warn(`[CityCut enrichment] ${message}`);
    return { byId, error: message };
  }
}
