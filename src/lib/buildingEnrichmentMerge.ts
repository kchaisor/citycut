import { clampBuildingHeight } from "./height";
import { useFromZone } from "./buildingUse";
import type {
  BuildingFeat,
  BuildingHeightTier,
  BuildingUseSourceTier,
  TypologySource,
} from "../types";
import type { BuildingEnrichmentRecord } from "./buildingEnrichmentTiles";
import { inferHeightTier } from "./buildingHeightResolve";
import { resolveUseSourceTier } from "./useSourceTier";

const USE_SOURCE_RANK: Record<BuildingUseSourceTier, number> = {
  overture: 5,
  clue: 4,
  bca: 3,
  zone: 2,
  unclassified: 1,
};

function typologyFromTile(tier: BuildingUseSourceTier): TypologySource {
  switch (tier) {
    case "overture":
      return "overture_class";
    case "clue":
      return "clue";
    case "bca":
      return "bca";
    case "zone":
      return "zone";
    default:
      return "none";
  }
}

export function enrichmentBeatsBuilding(
  building: BuildingFeat,
  record: BuildingEnrichmentRecord,
): boolean {
  const currentRank =
    building.useSourceTier != null
      ? USE_SOURCE_RANK[building.useSourceTier]
      : building.source === "osm_tag" || building.source === "overture_class"
        ? USE_SOURCE_RANK.overture
        : building.source === "zone"
          ? USE_SOURCE_RANK.zone
          : USE_SOURCE_RANK.unclassified;
  return USE_SOURCE_RANK[record.useSource] > currentRank;
}

/** Apply offline use + zone metadata from enrichment tiles (geometry stays Overture). */
export function mergeBuildingEnrichment(
  buildings: BuildingFeat[],
  byId: Map<string, BuildingEnrichmentRecord>,
): BuildingFeat[] {
  if (byId.size === 0) return buildings;
  return buildings.map((building) => {
    const id = building.overtureId;
    if (!id) return building;
    const record = byId.get(id);
    if (!record) return building;
    let next: BuildingFeat = { ...building };
    if (enrichmentBeatsBuilding(building, record)) {
      next = {
        ...next,
        use: record.use,
        source: typologyFromTile(record.useSource),
        useSourceTier: record.useSource,
      };
    }
    if (record.zoneCode && !next.zoneCode) {
      next = { ...next, zoneCode: record.zoneCode };
      const zoneUse = useFromZone(record.zoneCode, next.height);
      if (zoneUse && record.useSource === "zone") {
        next = { ...next, use: zoneUse, source: "zone", useSourceTier: "zone" };
      }
    }
    if (record.heightM != null && record.heightSource === "lidar") {
      next = {
        ...next,
        lidarHeightM: record.heightM,
      };
    }
    return next;
  });
}

/** LiDAR from tiles — after CoM/DAM resolution, before Overture height tags win. */
export function applyLidarHeightsFromEnrichment(buildings: BuildingFeat[]): BuildingFeat[] {
  return buildings.map((building) => {
    if (building.heightManual) return building;
    const tier = inferHeightTier(building);
    if (tier === "com" || tier === "manual") return building;
    if (tier === "development_floors") return building;
    const lidar = building.lidarHeightM;
    if (lidar == null || !(lidar > 0)) return building;
    const height = clampBuildingHeight(lidar);
    return {
      ...building,
      height,
      heightFromFallback: undefined,
      heightTier: "lidar" as BuildingHeightTier,
      zoneDefaultNote: undefined,
    };
  });
}

export function countUseSourceTiers(
  buildings: BuildingFeat[],
): Record<BuildingUseSourceTier, number> {
  const counts: Record<BuildingUseSourceTier, number> = {
    overture: 0,
    clue: 0,
    bca: 0,
    zone: 0,
    unclassified: 0,
  };
  for (const building of buildings) {
    counts[resolveUseSourceTier(building)] += 1;
  }
  return counts;
}
