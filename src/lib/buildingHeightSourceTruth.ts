import { openRing, signedArea } from "./geo";
import { intersectionAreaM2, COM_FALLBACK_MIN_FRACTION } from "./comBuildingHeightsMatch";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import {
  damRecordsWonByBuilding,
  matchDevelopmentFloorsToBuilding,
  pickDamFloorRecipient,
  type DamFloorRecord,
} from "./comDevelopmentFloors";
import type { BuildingFeat, BuildingHeightTier, LonLat } from "../types";
import { inferHeightTier } from "./buildingHeightResolve";

export type RealSourceKind = "com" | "dam" | "overture_height" | "overture_floors";

export type RealSourceOverlap = {
  kind: RealSourceKind;
  detail: string;
  overlapRatio?: number;
};

/** Any CoM footprint intersection / OSM area (includes below match threshold). */
export function comAnyOverlapRatio(
  building: BuildingFeat,
  footprints: ComBuildingFootprint[],
): number {
  const osmArea = Math.abs(signedArea(openRing(building.ring)));
  if (osmArea <= 0 || footprints.length === 0) return 0;
  let covered = 0;
  for (const fp of footprints) {
    covered += intersectionAreaM2(building, fp);
  }
  return covered / osmArea;
}

function damNearButLost(
  building: BuildingFeat,
  center: LonLat,
  records: DamFloorRecord[],
  allBuildings: BuildingFeat[],
): RealSourceOverlap | null {
  const nearFloors = matchDevelopmentFloorsToBuilding(building, center, records);
  if (nearFloors == null) return null;
  if (damRecordsWonByBuilding(building, center, records, allBuildings).length > 0) return null;
  for (const record of records) {
    if (matchDevelopmentFloorsToBuilding(building, center, [record]) == null) continue;
    const recipient = pickDamFloorRecipient(allBuildings, center, record);
    if (recipient && recipient.id !== building.id) {
      return {
        kind: "dam",
        detail: `DAM record (${record.floorsAbove} floors) assigned to larger neighbour, not this footprint`,
      };
    }
  }
  return {
    kind: "dam",
    detail: `DAM lists ${nearFloors} floors within 70 m but this building did not win assignment`,
  };
}

/** Real measured/tag sources that overlap this building but did not become the resolved height tier. */
export function detectRealSourceOverlaps(
  building: BuildingFeat,
  center: LonLat,
  footprints: ComBuildingFootprint[],
  damRecords: DamFloorRecord[],
  allBuildings: BuildingFeat[],
): RealSourceOverlap[] {
  const overlaps: RealSourceOverlap[] = [];
  const tier = inferHeightTier(building);
  if (tier === "real_source_unmatched") return overlaps;
  if (tier !== "zone_default") return overlaps;

  const comRatio = comAnyOverlapRatio(building, footprints);
  if (comRatio > 0) {
    if (comRatio < COM_FALLBACK_MIN_FRACTION) {
      overlaps.push({
        kind: "com",
        detail: `CoM footprint overlaps ${(comRatio * 100).toFixed(0)}%, below match threshold`,
        overlapRatio: comRatio,
      });
    } else {
      overlaps.push({
        kind: "com",
        detail: `CoM footprint overlaps ${(comRatio * 100).toFixed(0)}% but height did not apply`,
        overlapRatio: comRatio,
      });
    }
  }

  const dam = damNearButLost(building, center, damRecords, allBuildings);
  if (dam) overlaps.push(dam);

  if (!building.heightFromFallback) {
    if (building.numFloors != null && building.numFloors > 0 && tier === "zone_default") {
      overlaps.push({
        kind: "overture_floors",
        detail: `Overture num_floors=${building.numFloors} present but height tier is zone default`,
      });
    } else if (tier === "zone_default") {
      overlaps.push({
        kind: "overture_height",
        detail: "Overture height present but height tier is zone default",
      });
    }
  }

  return overlaps;
}

export function formatRealSourceUnmatchedNote(overlaps: RealSourceOverlap[]): string {
  if (overlaps.length === 0) return "estimate, no measured height";
  return overlaps.map((o) => o.detail).join("; ");
}

export function applyRealSourceUnmatchedTier(
  building: BuildingFeat,
  center: LonLat,
  footprints: ComBuildingFootprint[],
  damRecords: DamFloorRecord[],
  allBuildings: BuildingFeat[],
): BuildingFeat {
  if (building.heightManual) return building;
  const tier = inferHeightTier(building);
  if (tier !== "zone_default") return building;

  const overlaps = detectRealSourceOverlaps(building, center, footprints, damRecords, allBuildings);
  if (overlaps.length === 0) return building;

  const note = formatRealSourceUnmatchedNote(overlaps);
  console.warn(`[CityCut height] Building ${building.id}: real source unmatched — ${note}`);
  return {
    ...building,
    heightTier: "real_source_unmatched" satisfies BuildingHeightTier,
    zoneDefaultNote: note,
  };
}

export function applyHeightSourceTruthPass(
  buildings: BuildingFeat[],
  center: LonLat,
  footprints: ComBuildingFootprint[],
  damRecords: DamFloorRecord[],
): BuildingFeat[] {
  return buildings.map((b) =>
    applyRealSourceUnmatchedTier(b, center, footprints, damRecords, buildings),
  );
}

/** Guard: zone_default must not coexist with any real-source overlap (CoM overlap > 0, etc.). */
export function findSilentDefaultViolations(
  buildings: BuildingFeat[],
  center: LonLat,
  footprints: ComBuildingFootprint[],
  damRecords: DamFloorRecord[],
): { id: number; tier: BuildingHeightTier; overlaps: RealSourceOverlap[] }[] {
  const bad: { id: number; tier: BuildingHeightTier; overlaps: RealSourceOverlap[] }[] = [];
  for (const building of buildings) {
    const tier = inferHeightTier(building);
    if (tier !== "zone_default") continue;
    const overlaps = detectRealSourceOverlaps(building, center, footprints, damRecords, buildings);
    if (overlaps.length > 0) bad.push({ id: building.id, tier, overlaps });
  }
  return bad;
}
