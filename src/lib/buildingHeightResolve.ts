import { openRing, signedArea } from "./geo";
import { clampBuildingHeight } from "./height";
import { intersectionAreaM2, tallestExtrusionHeight, COM_SLIVER_MIN_FRACTION } from "./comBuildingHeightsMatch";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import type { DamFloorRecord } from "./comDevelopmentFloors";
import { matchDevelopmentFloorsToBuilding } from "./comDevelopmentFloors";
import type { LonLat } from "../types";
import type { BuildingFeat, BuildingExtrusionPart, BuildingHeightTier } from "../types";

/** Storey height used for floor-count tiers (Overture, DAM, OSM levels). */
export const STOREY_HEIGHT_M = 3;

/**
 * Building scalar height tier order (first match wins for {@link BuildingFeat.height}).
 *
 * 1. Manual edit ({@link BuildingFeat.heightManual})
 * 2. City of Melbourne 2023 footprints — clipped extrusions or aggregate match
 * 3. Overture / OSM explicit height tag
 * 4. Overture `num_floors` × {@link STOREY_HEIGHT_M}
 * 5. CoM Development Activity Monitor `floors_above` × {@link STOREY_HEIGHT_M}
 * 6. OSM `building:levels` × {@link STOREY_HEIGHT_M} (Overture source tags when present)
 * 7. Vicmap zone / shed fallback ({@link BuildingFeat.heightFromFallback})
 *
 * Manual edits clear extrusion parts. CoM may set {@link BuildingFeat.extrusionParts}; scalar height
 * is synced to the tallest part (or aggregate) for panels, shadows, and plan metadata.
 */
export type BuildingHeightTierMeta = {
  tier: BuildingHeightTier;
  /** When tier is zone_default but measured data exists nearby — show in the panel. */
  zoneDefaultNote?: string;
  /** CoM DAM or Overture floor count used for tier 5 / 4. */
  recordedFloors?: number;
};

function partAreaM2(part: BuildingExtrusionPart): number {
  return Math.abs(signedArea(openRing(part.ring)));
}

/** Tallest extrusion height; falls back to {@link BuildingFeat.height}. */
export function effectiveBuildingHeightM(building: BuildingFeat): number {
  return tallestExtrusionHeight(building);
}

export function inferHeightTier(building: BuildingFeat): BuildingHeightTier {
  if (building.heightManual) return "manual";
  if (building.heightTier) return building.heightTier;
  if (building.extrusionParts?.length) return "com";
  if (building.heightFromFallback) return "zone_default";
  if (building.developmentFloors != null && building.developmentFloors > 0) return "development_floors";
  if (building.numFloors != null && building.numFloors > 0) return "overture_floors";
  return "overture_height";
}

export function heightTierLabel(tier: BuildingHeightTier, meta?: BuildingHeightTierMeta): string {
  switch (tier) {
    case "manual":
      return "Manual edit";
    case "com":
      return "City of Melbourne";
    case "overture_height":
      return "Overture height";
    case "overture_floors":
      return "Overture num_floors";
    case "development_floors":
      return "CoM development floors";
    case "osm_levels":
      return "OSM building:levels";
    default: {
      const note = meta?.zoneDefaultNote;
      return note ? `Zone default · ${note}` : "Zone default · estimate, no measured height";
    }
  }
}

/** After CoM clip/match, sync scalar height and tier metadata. */
export function finalizeComMatchedBuilding(building: BuildingFeat): BuildingFeat {
  if (building.heightManual) return building;
  if (!building.extrusionParts?.length) return building;
  const height = clampBuildingHeight(effectiveBuildingHeightM(building));
  return {
    ...building,
    height,
    heightFromFallback: undefined,
    heightTier: "com",
    zoneDefaultNote: undefined,
  };
}

/** Apply aggregate CoM scalar height when extrusions were not created but a match exists. */
export function applyComScalarHeight(building: BuildingFeat, heightM: number): BuildingFeat {
  if (building.heightManual) return building;
  const height = clampBuildingHeight(heightM);
  return {
    ...building,
    height,
    heightFromFallback: undefined,
    heightTier: "com",
    zoneDefaultNote: undefined,
    extrusionParts: undefined,
  };
}

/** Apply DAM / development floor count before zone fallback. */
export function buildingEligibleForDamFloors(building: BuildingFeat): boolean {
  if (building.heightManual) return false;
  if (building.heightTier === "com" || building.extrusionParts?.length) return false;
  return Boolean(building.heightFromFallback);
}

export function applyDevelopmentFloorsHeight(building: BuildingFeat, floorsAbove: number): BuildingFeat {
  if (!buildingEligibleForDamFloors(building)) return building;
  if (!(floorsAbove > 0)) return building;
  const height = clampBuildingHeight(floorsAbove * STOREY_HEIGHT_M);
  return {
    ...building,
    height,
    heightFromFallback: undefined,
    heightTier: "development_floors",
    developmentFloors: floorsAbove,
    zoneDefaultNote: undefined,
  };
}

export function flagUnresolvedZoneDefault(
  building: BuildingFeat,
  note: string,
): BuildingFeat {
  if (!building.heightFromFallback) return building;
  if (building.zoneDefaultNote === note) return building;
  console.warn(`[CityCut height] Building ${building.id}: zone default — ${note}`);
  return { ...building, zoneDefaultNote: note };
}

/** Area-weighted mean height across extrusion parts (diagnostics). */
export function buildingHasComOverlap(
  building: BuildingFeat,
  footprints: ComBuildingFootprint[],
): boolean {
  const osmArea = Math.abs(signedArea(openRing(building.ring)));
  if (osmArea <= 0) return false;
  let covered = 0;
  for (const fp of footprints) {
    covered += intersectionAreaM2(building, fp);
  }
  return covered / osmArea >= COM_SLIVER_MIN_FRACTION;
}

/** Plain Vicmap zone fallbacks show an explicit estimate label in the building panel. */
export function stampPlainZoneDefaultLabels(buildings: BuildingFeat[]): BuildingFeat[] {
  return buildings.map((building) => {
    if (!building.heightFromFallback || building.zoneDefaultNote) return building;
    return flagUnresolvedZoneDefault(building, "estimate, no measured height");
  });
}

export function annotateUnresolvedZoneDefaults(
  buildings: BuildingFeat[],
  center: LonLat,
  footprints: ComBuildingFootprint[],
  damRecords: DamFloorRecord[],
): BuildingFeat[] {
  return buildings.map((building) => {
    if (!building.heightFromFallback) return building;
    const notes: string[] = [];
    if (footprints.length > 0 && buildingHasComOverlap(building, footprints)) {
      notes.push("CoM data nearby not matched");
    }
    const damFloors = matchDevelopmentFloorsToBuilding(building, center, damRecords);
    if (damFloors != null) {
      notes.push(`recorded ${damFloors} floors not applied`);
    }
    if (notes.length === 0) {
      return flagUnresolvedZoneDefault(building, "estimate, no measured height");
    }
    return flagUnresolvedZoneDefault(building, notes.join("; "));
  });
}

export function areaWeightedExtrusionHeightM(building: BuildingFeat): number | null {
  const parts = building.extrusionParts;
  if (!parts?.length) return null;
  let weighted = 0;
  let area = 0;
  for (const part of parts) {
    const a = partAreaM2(part);
    if (a <= 0) continue;
    weighted += a * part.height;
    area += a;
  }
  if (area <= 0) return null;
  return weighted / area;
}
