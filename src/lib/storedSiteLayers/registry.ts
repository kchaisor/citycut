import { squareBBox } from "../geo";
import type { LonLat } from "../../types";
import type { StoredSiteLayerManifest } from "./types";

export type StoredSiteLayerRegistryEntry = {
  id: string;
  manifestPath: string;
  lonLatWSEN: [number, number, number, number];
};

const BASE = "site-layers";

export const STORED_SITE_LAYER_REGISTRY: StoredSiteLayerRegistryEntry[] = [
  {
    id: "sydney-rozelle",
    manifestPath: `${BASE}/sydney-rozelle/manifest.json`,
    lonLatWSEN: [151.17312078, -33.87575384, 151.19324393, -33.85964131],
  },
];

export function storedSiteManifestUrl(manifestPath: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${manifestPath}`;
}

export function storedSiteAssetUrl(layerId: string, fileName: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${BASE}/${layerId}/${fileName}`;
}

export function parseStoredSiteManifest(raw: unknown): StoredSiteLayerManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id : null;
  const name = typeof data.name === "string" ? data.name : null;
  const source = typeof data.source === "string" ? data.source : "";
  const epsg = typeof data.epsg === "number" ? data.epsg : null;
  const origin = data.origin as { mga?: number[]; lonLat?: number[] } | undefined;
  const bbox = data.bbox as { lonLatWSEN?: number[] } | undefined;
  const files = data.files;
  if (!id || !name || epsg == null || !origin?.mga || origin.mga.length < 2) return null;
  if (!bbox?.lonLatWSEN || bbox.lonLatWSEN.length < 4) return null;
  if (!Array.isArray(files)) return null;
  const mga = origin.mga;
  const lonLat = origin.lonLat ?? [0, 0];
  const wsen = bbox.lonLatWSEN as [number, number, number, number];
  const mgaBox = (data.bbox as { mga?: { min?: number[]; max?: number[] } }).mga;
  const min = mgaBox?.min;
  const max = mgaBox?.max;
  if (!min || !max || min.length < 3 || max.length < 3) return null;
  return {
    id,
    name,
    source,
    epsg,
    origin: {
      mga: [mga[0]!, mga[1]!, mga[2] ?? 0],
      lonLat: [lonLat[0] ?? 0, lonLat[1] ?? 0],
    },
    bbox: {
      mga: {
        min: [min[0]!, min[1]!, min[2]!],
        max: [max[0]!, max[1]!, max[2]!],
      },
      lonLatWSEN: wsen,
    },
    files: files.flatMap((file) => {
      if (!file || typeof file !== "object") return [];
      const entry = file as Record<string, unknown>;
      const path = typeof entry.path === "string" ? entry.path : null;
      if (!path) return [];
      const row: { path: string; structureId?: string } = { path };
      if (typeof entry.structureId === "string") row.structureId = entry.structureId;
      return [row];
    }),
  };
}

export function cutIntersectsStoredLayerBbox(
  center: LonLat,
  sideM: number,
  manifest: StoredSiteLayerManifest,
): boolean {
  const cut = squareBBox(center, sideM);
  const [west, south, east, north] = manifest.bbox.lonLatWSEN;
  return !(cut.east < west || cut.west > east || cut.north < south || cut.south > north);
}

export function registryEntryForCut(
  center: LonLat,
  sideM: number,
): StoredSiteLayerRegistryEntry | null {
  const cut = squareBBox(center, sideM);
  for (const entry of STORED_SITE_LAYER_REGISTRY) {
    const [west, south, east, north] = entry.lonLatWSEN;
    if (!(cut.east < west || cut.west > east || cut.north < south || cut.south > north)) {
      return entry;
    }
  }
  return null;
}
