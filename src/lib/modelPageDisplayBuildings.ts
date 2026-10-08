import { applyHeightOverrides, clearAllHeightOverrides } from "./heightOverrides";
import { annotateUnresolvedZoneDefaults } from "./buildingHeightResolve";
import { applyComBuildingHeights } from "./comBuildingHeights";
import type { DamFloorRecord } from "./comDevelopmentFloors";
import {
  applyLidarHeightsFromEnrichment,
  mergeBuildingEnrichment,
} from "./buildingEnrichmentMerge";
import { assignExternalUses } from "./useCascade";
import type { BuildingEnrichmentRecord } from "./buildingEnrichmentTiles";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import type { BuildingFeat, LonLat } from "../types";
import type { ZonePolygon } from "./useCascade";

/** Same building list and scalar heights as ModelPage (CoM on, no manual edits). */
export function modelPageDisplayBuildings(input: {
  center: LonLat;
  overtureBuildings: BuildingFeat[];
  enrichmentById: Record<string, BuildingEnrichmentRecord>;
  zones: ZonePolygon[] | null;
  damRecords: DamFloorRecord[];
  comFootprints: ComBuildingFootprint[];
}): BuildingFeat[] {
  const byId = new Map(Object.entries(input.enrichmentById));
  const enriched = mergeBuildingEnrichment(input.overtureBuildings, byId);
  const zoned = assignExternalUses(enriched, input.zones);
  const withLidar = applyLidarHeightsFromEnrichment(zoned);
  const buildingsWithoutCom = structuredClone(withLidar);
  const { buildings: withCom } = applyComBuildingHeights(buildingsWithoutCom, input.comFootprints);
  const annotated = annotateUnresolvedZoneDefaults(
    withCom,
    input.center,
    input.comFootprints,
    input.damRecords,
  );
  const base = annotated;
  const { buildings } = applyHeightOverrides(base, clearAllHeightOverrides(), input.center);
  return buildings;
}

export function modelPageDisplayedHeightM(building: BuildingFeat): number {
  return building.height;
}

export function modelPageHeightSignature(buildings: BuildingFeat[]): { id: number; heightM: number }[] {
  return buildings
    .map((building) => ({
      id: building.id,
      heightM: Math.round(modelPageDisplayedHeightM(building) * 1000) / 1000,
    }))
    .sort((a, b) => a.id - b.id);
}
