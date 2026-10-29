import { getColour, type ColourKey } from "./colours";
import { inferHeightTier } from "./buildingHeightResolve";
import type { BuildingFeat, BuildingHeightTier } from "../types";

/** Three-class height data reliability used for viewport colouring and vector export layers. */
export type HeightReliabilityClass = "surveyed" | "osm_tagged" | "estimated";

export const HEIGHT_RELIABILITY_CLASSES: HeightReliabilityClass[] = ["surveyed", "osm_tagged", "estimated"];

export const HEIGHT_RELIABILITY_EXPORT_LAYER: Record<HeightReliabilityClass, string> = {
  surveyed: "CC_Height_Surveyed",
  osm_tagged: "CC_Height_OSM",
  estimated: "CC_Height_Estimated",
};

export const HEIGHT_RELIABILITY_FILL_TOKEN: Record<HeightReliabilityClass, ColourKey> = {
  surveyed: "--fill-height-surveyed",
  osm_tagged: "--fill-height-osm",
  estimated: "--fill-height-estimated",
};

export const HEIGHT_RELIABILITY_LABEL: Record<HeightReliabilityClass, string> = {
  surveyed: "Surveyed / measured",
  osm_tagged: "OSM / Overture tag",
  estimated: "Estimated",
};

const SURVEYED_TIERS = new Set<BuildingHeightTier>(["manual", "com", "lidar", "development_floors"]);
const OSM_TIERS = new Set<BuildingHeightTier>(["overture_height", "overture_floors", "osm_levels"]);
const ESTIMATED_TIERS = new Set<BuildingHeightTier>(["zone_default", "real_source_unmatched"]);

/** Map resolved height tier to the three reliability classes (uses {@link inferHeightTier}, never guesses). */
export function heightReliabilityClass(building: BuildingFeat): HeightReliabilityClass {
  const tier = inferHeightTier(building);
  if (SURVEYED_TIERS.has(tier)) return "surveyed";
  if (OSM_TIERS.has(tier)) return "osm_tagged";
  if (ESTIMATED_TIERS.has(tier)) return "estimated";
  return "estimated";
}

export function heightReliabilityFill(building: BuildingFeat): string {
  return getColour(HEIGHT_RELIABILITY_FILL_TOKEN[heightReliabilityClass(building)]);
}

export function heightReliabilityFillForExportLayer(exportLayer: string): string | undefined {
  const entry = (Object.entries(HEIGHT_RELIABILITY_EXPORT_LAYER) as [HeightReliabilityClass, string][]).find(
    ([, layer]) => layer === exportLayer,
  );
  return entry ? getColour(HEIGHT_RELIABILITY_FILL_TOKEN[entry[0]]) : undefined;
}

export function heightReliabilityLabel(building: BuildingFeat): string {
  return HEIGHT_RELIABILITY_LABEL[heightReliabilityClass(building)];
}

export function countHeightReliabilityClasses(
  buildings: readonly BuildingFeat[],
): Record<HeightReliabilityClass, number> {
  const counts: Record<HeightReliabilityClass, number> = { surveyed: 0, osm_tagged: 0, estimated: 0 };
  for (const building of buildings) {
    counts[heightReliabilityClass(building)] += 1;
  }
  return counts;
}
