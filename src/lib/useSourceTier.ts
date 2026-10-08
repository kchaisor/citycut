import type { BuildingFeat, BuildingUseSourceTier } from "../types";

/** Canonical offline / live tier for source legend and QA counts. */
export function resolveUseSourceTier(building: BuildingFeat): BuildingUseSourceTier {
  if (building.use === "unclassified") return "unclassified";
  if (building.useSourceTier && building.useSourceTier !== "unclassified") {
    return building.useSourceTier;
  }
  switch (building.source) {
    case "osm_tag":
    case "overture_class":
      return "overture";
    case "clue":
      return "clue";
    case "bca":
      return "bca";
    case "zone":
      return "zone";
    default:
      return "unclassified";
  }
}

export function withResolvedUseSourceTier(building: BuildingFeat): BuildingFeat {
  const tier = resolveUseSourceTier(building);
  if (building.useSourceTier === tier) return building;
  return { ...building, useSourceTier: tier };
}

export function withResolvedUseSourceTiers(buildings: BuildingFeat[]): BuildingFeat[] {
  return buildings.map(withResolvedUseSourceTier);
}

export function assertClassifiedBuildingsHaveSourceTier(buildings: BuildingFeat[]): void {
  for (const building of buildings) {
    if (building.use === "unclassified") continue;
    const tier = resolveUseSourceTier(building);
    if (tier === "unclassified") {
      throw new Error(
        `Building ${building.overtureId ?? building.id} has use ${building.use} but source tier unclassified (source=${building.source})`,
      );
    }
  }
}
