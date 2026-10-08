import type { EnrichmentManifest } from "./buildingEnrichmentTiles";
import type { BuildingFeat, BuildingHeightTier } from "../types";
import { inferHeightTier } from "./buildingHeightResolve";

/** Manifest `lidar.status` when the tier is wired but no DSM/DTM bake exists. */
export const LIDAR_STATUS_NO_DATA = "no_data";

/** Single public line for manifest detail, legend, census, and CI logs. */
export const LIDAR_NO_DATA_LINE = "LiDAR: no data, ELVIS not ordered";

export function defaultLidarManifestEntry(): { status: typeof LIDAR_STATUS_NO_DATA; detail: string } {
  return { status: LIDAR_STATUS_NO_DATA, detail: LIDAR_NO_DATA_LINE };
}

export function lidarLegendLine(manifest: EnrichmentManifest | null | undefined): string {
  if (manifest?.lidar?.detail?.trim()) return manifest.lidar.detail.trim();
  return LIDAR_NO_DATA_LINE;
}

export function logLidarEnrichmentStatus(manifest: EnrichmentManifest | null | undefined): void {
  const line = lidarLegendLine(manifest);
  console.info(`[CityCut enrichment] ${line}`);
}

export function countBuildingHeightTiers(buildings: BuildingFeat[]): Record<BuildingHeightTier, number> {
  const counts: Record<BuildingHeightTier, number> = {
    manual: 0,
    com: 0,
    lidar: 0,
    overture_height: 0,
    overture_floors: 0,
    development_floors: 0,
    osm_levels: 0,
    zone_default: 0,
    real_source_unmatched: 0,
  };
  for (const building of buildings) {
    counts[inferHeightTier(building)] += 1;
  }
  return counts;
}
