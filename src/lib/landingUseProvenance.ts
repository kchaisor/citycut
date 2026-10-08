import type { BuildingFeat } from "../types";
import { resolveUseSourceTier } from "./useSourceTier";

export type UseSourceTierKey =
  | "overture"
  | "clue"
  | "bca"
  | "zone"
  | "unclassified";

export type LandingUseProvenanceCounts = {
  total: number;
  /** Buildings with enrichment tile tier after merge (`useSourceTier` not unclassified). */
  tileTierAfterMerge: number;
  /** Classified after merge (any source). */
  classifiedAfterMerge: number;
  unclassifiedAfterMerge: number;
  /** `source === 'none'` before refine → classified after refine (live Vicmap path). */
  liveRefineNewlyClassified: number;
  unclassifiedFinal: number;
  /** Final in-frame counts by offline tile tier (`useSourceTier`). */
  finalTierCounts: Record<UseSourceTierKey, number>;
};

function buildingKey(building: BuildingFeat): string {
  return String(building.overtureId ?? building.id);
}

function isClassified(building: BuildingFeat): boolean {
  return building.use !== "unclassified" && building.source !== "none";
}

export function countLandingUseProvenance(
  merged: BuildingFeat[],
  final: BuildingFeat[],
): LandingUseProvenanceCounts {
  const finalByKey = new Map(final.map((building) => [buildingKey(building), building]));
  let tileTierAfterMerge = 0;
  let classifiedAfterMerge = 0;
  let unclassifiedAfterMerge = 0;
  let liveRefineNewlyClassified = 0;
  let unclassifiedFinal = 0;
  const finalTierCounts: Record<UseSourceTierKey, number> = {
    overture: 0,
    clue: 0,
    bca: 0,
    zone: 0,
    unclassified: 0,
  };

  for (const mergedBuilding of merged) {
    const finalBuilding = finalByKey.get(buildingKey(mergedBuilding)) ?? mergedBuilding;
    if (mergedBuilding.useSourceTier && mergedBuilding.useSourceTier !== "unclassified") {
      tileTierAfterMerge += 1;
    }
    if (isClassified(mergedBuilding)) classifiedAfterMerge += 1;
    else unclassifiedAfterMerge += 1;
    if (mergedBuilding.source === "none" && isClassified(finalBuilding)) {
      liveRefineNewlyClassified += 1;
    }
    if (!isClassified(finalBuilding)) unclassifiedFinal += 1;
    const tier = resolveUseSourceTier(finalBuilding);
    finalTierCounts[tier] += 1;
  }

  return {
    total: merged.length,
    tileTierAfterMerge,
    classifiedAfterMerge,
    unclassifiedAfterMerge,
    liveRefineNewlyClassified,
    unclassifiedFinal,
    finalTierCounts,
  };
}
