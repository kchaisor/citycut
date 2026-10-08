import { inferHeightTier } from "./buildingHeightResolve";
import type { BuildingFeat } from "../types";

/** True when CoM changed height or added at least one non-OSM extrusion part. */
export function buildingHasComDerivedExtrusion(before: BuildingFeat, after: BuildingFeat): boolean {
  if (after.extrusionParts?.length) {
    return after.extrusionParts.some((part) => Math.abs(part.height - before.height) > 0.05);
  }
  return Math.abs(after.height - before.height) > 0.05;
}

/** OSM buildings with at least one CoM-derived extrusion (shared UI + benchmark). */
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

/** Buildings whose resolved height tier is CoM 2023 (legend + summary). */
export function countBuildingsWithComHeightTier(buildings: BuildingFeat[]): number {
  let count = 0;
  for (const building of buildings) {
    if (inferHeightTier(building) === "com") count += 1;
  }
  return count;
}
