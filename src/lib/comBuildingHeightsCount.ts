import { inferHeightTier } from "./buildingHeightResolve";
import type { BuildingFeat } from "../types";

export function buildingHasComDerivedExtrusion(before: BuildingFeat, after: BuildingFeat): boolean {
  if (after.extrusionParts?.length) {
    return after.extrusionParts.some((part) => Math.abs(part.height - before.height) > 0.05);
  }
  return Math.abs(after.height - before.height) > 0.05;
}

export function countBuildingsWithComDerivedExtrusion(
  before: BuildingFeat[],
  after: BuildingFeat[],
): number {
  const n = Math.min(before.length, after.length);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (buildingHasComDerivedExtrusion(before[i], after[i])) count += 1;
  }
  return count;
}

export function countBuildingsWithComHeightTier(buildings: BuildingFeat[]): number {
  let count = 0;
  for (const building of buildings) {
    if (inferHeightTier(building) === "com") count += 1;
  }
  return count;
}
