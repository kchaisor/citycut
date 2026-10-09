import { applyComBuildingHeights } from "./comBuildingHeights";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import { applyDevelopmentFloorsToBuildings, type DamFloorRecord } from "./comDevelopmentFloors";
import { applyHeightSourceTruthPass } from "./buildingHeightSourceTruth";
import {
  applyLidarHeightsFromEnrichment,
  mergeBuildingEnrichment,
} from "./buildingEnrichmentMerge";
import type { BuildingEnrichmentRecord } from "./buildingEnrichmentTiles";
import { assignExternalUses, type ZonePolygon } from "./useCascade";
import type { BuildingFeat, LonLat } from "../types";

export type LandmarkCutSnapshot = {
  name: string;
  center: LonLat;
  sideM: number;
  overtureBuildings: BuildingFeat[];
  enrichmentRecords: BuildingEnrichmentRecord[];
  zones: ZonePolygon[] | null;
  damRecords: DamFloorRecord[];
  comFootprints: ComBuildingFootprint[];
};

export function enrichmentMapFromRecords(records: BuildingEnrichmentRecord[]): Map<string, BuildingEnrichmentRecord> {
  const byId = new Map<string, BuildingEnrichmentRecord>();
  for (const record of records) {
    byId.set(record.overtureId, record);
  }
  return byId;
}

/**
 * Only the enrichment records a cut can use: resolveLandmarkCut looks records up by
 * the overtureId of the cut's own buildings, so every other record is dead weight in a fixture.
 */
export function enrichmentRecordsForBuildings(
  buildings: BuildingFeat[],
  records: Iterable<BuildingEnrichmentRecord>,
): BuildingEnrichmentRecord[] {
  const ids = new Set(buildings.map((building) => building.overtureId).filter(Boolean));
  return [...records].filter((record) => ids.has(record.overtureId));
}

export function resolveLandmarkCut(snapshot: LandmarkCutSnapshot): BuildingFeat[] {
  const byId = enrichmentMapFromRecords(snapshot.enrichmentRecords);
  const enriched = mergeBuildingEnrichment(snapshot.overtureBuildings, byId);
  const zoned = assignExternalUses(enriched, snapshot.zones);
  const withLidar = applyLidarHeightsFromEnrichment(zoned);
  const withDam = applyDevelopmentFloorsToBuildings(withLidar, snapshot.center, snapshot.damRecords);
  const { buildings: withCom } = applyComBuildingHeights(withDam, snapshot.comFootprints);
  return applyHeightSourceTruthPass(withCom, snapshot.center, snapshot.comFootprints, snapshot.damRecords);
}
