import type { BuildingFeat, BuildingHeightTier } from "../types";
import { getColour, type ColourKey } from "./colours";
import { inferHeightTier } from "./buildingHeightResolve";

export type HeightReliability = "measured" | "recorded" | "estimated" | "manual";

export const HEIGHT_RELIABILITY_KEYS = ["measured", "recorded", "estimated", "manual"] as const satisfies readonly HeightReliability[];

type ReliabilityMeta = { label: string; detail: string; key: ColourKey; layer: string; estimate: boolean; readonly color: string };

function meta(label: string, detail: string, key: ColourKey, estimate: boolean): ReliabilityMeta {
  return {
    label,
    detail,
    key,
    estimate,
    layer: `Buildings::Reliability::${label}`,
    get color() {
      return getColour(key);
    },
  };
}

export const HEIGHT_RELIABILITY_META: Record<HeightReliability, ReliabilityMeta> = {
  measured: meta("Measured", "CoM 2023 · LiDAR", "--reliability-measured", false),
  recorded: meta("Recorded", "Overture · OSM levels · DAM floors", "--reliability-recorded", false),
  estimated: meta("Estimated", "Zone est. · defaults", "--reliability-estimated", true),
  manual: meta("Manual", "Your edit", "--reliability-manual", false),
};

const TIER_RELIABILITY: Record<BuildingHeightTier, HeightReliability> = {
  manual: "manual",
  com: "measured",
  lidar: "measured",
  overture_height: "recorded",
  overture_floors: "recorded",
  development_floors: "recorded",
  osm_levels: "recorded",
  zone_default: "estimated",
  real_source_unmatched: "estimated",
};

export function heightTierReliability(tier: BuildingHeightTier): HeightReliability {
  return TIER_RELIABILITY[tier];
}

export function buildingHeightReliability(building: BuildingFeat): HeightReliability {
  return TIER_RELIABILITY[inferHeightTier(building)];
}

export function countHeightReliability(buildings: readonly BuildingFeat[]): Record<HeightReliability, number> {
  const counts: Record<HeightReliability, number> = { measured: 0, recorded: 0, estimated: 0, manual: 0 };
  for (const building of buildings) {
    if (building.importedMassing) continue;
    counts[buildingHeightReliability(building)] += 1;
  }
  return counts;
}

export function reliabilityBucketName(reliability: HeightReliability): string {
  return `reliability:${reliability}`;
}

export function parseReliabilityBucket(name: string): HeightReliability | undefined {
  if (!name.startsWith("reliability:")) return undefined;
  const key = name.slice("reliability:".length) as HeightReliability;
  return key in HEIGHT_RELIABILITY_META ? key : undefined;
}

export function reliabilityFill(reliability: HeightReliability): string {
  return HEIGHT_RELIABILITY_META[reliability].color;
}
