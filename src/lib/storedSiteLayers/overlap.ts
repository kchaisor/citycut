import { intersectionAreaM2 } from "../comBuildingHeightsMatch";
import { openRing, signedArea } from "../geo";
import type { BuildingFeat } from "../../types";
import type { StoredSiteFootprint } from "./types";

export const STORED_SITE_OVERLAP_MIN_M2 = 1;
export const STORED_SITE_OVERLAP_MIN_FRACTION = 0.1;

function buildingAreaM2(building: BuildingFeat): number {
  const outer = Math.abs(signedArea(openRing(building.ring)));
  let holes = 0;
  for (const hole of building.holes) holes += Math.abs(signedArea(openRing(hole)));
  return Math.max(0, outer - holes);
}

export function overtureBuildingOverlapsStoredFootprint(
  building: BuildingFeat,
  footprint: Pick<StoredSiteFootprint, "ring" | "holes">,
): { overlaps: boolean; intersectionM2: number } {
  const intersectionM2 = intersectionAreaM2(building, footprint);
  if (intersectionM2 <= 0) return { overlaps: false, intersectionM2: 0 };
  const osmArea = buildingAreaM2(building);
  const byArea = intersectionM2 > STORED_SITE_OVERLAP_MIN_M2;
  const byFraction = osmArea > 0 && intersectionM2 / osmArea > STORED_SITE_OVERLAP_MIN_FRACTION;
  return { overlaps: byArea || byFraction, intersectionM2 };
}

export function hideNonMeshBuildingsOverlappingStoredSite(
  buildings: BuildingFeat[],
  footprints: StoredSiteFootprint[],
): { buildings: BuildingFeat[]; hiddenCount: number } {
  const masks = footprints.filter((fp) => fp.props.role === "building");
  if (masks.length === 0) return { buildings, hiddenCount: 0 };
  let hiddenCount = 0;
  const kept: BuildingFeat[] = [];
  for (const building of buildings) {
    if (building.storedSiteMesh) {
      kept.push(building);
      continue;
    }
    let hide = false;
    for (const mask of masks) {
      if (overtureBuildingOverlapsStoredFootprint(building, mask).overlaps) {
        hide = true;
        break;
      }
    }
    if (hide) hiddenCount++;
    else kept.push(building);
  }
  return { buildings: kept, hiddenCount };
}

export const hideOvertureBuildingsOverlappingStoredMesh = hideNonMeshBuildingsOverlappingStoredSite;

export function slabAndStructureFootprintsNeverHide(
  footprints: StoredSiteFootprint[],
  building: BuildingFeat,
): boolean {
  const masks = footprints.filter((fp) => fp.props.role !== "building");
  for (const mask of masks) {
    if (overtureBuildingOverlapsStoredFootprint(building, mask).overlaps) return false;
  }
  return true;
}
