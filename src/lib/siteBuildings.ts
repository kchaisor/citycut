import { intersectionAreaM2 } from "./comBuildingHeightsMatch";
import { openRing, signedArea } from "./geo";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, Pt } from "../types";
import type { ParcelPolygon } from "./vicmapSiteParcel";

export const SITE_OVERLAP_FRACTION = 0.5;

function footprintAreaM2(building: Pick<BuildingFeat, "ring" | "holes">): number {
  const outer = openRing(building.ring);
  if (outer.length < 3) return 0;
  let area = Math.abs(signedArea(outer));
  for (const hole of building.holes) {
    const inner = openRing(hole);
    if (inner.length >= 3) area -= Math.abs(signedArea(inner));
  }
  return Math.max(0, area);
}

function overlapWithParcelM2(
  building: Pick<BuildingFeat, "ring" | "holes">,
  parcel: ParcelPolygon,
): number {
  return intersectionAreaM2(
    { ring: building.ring, holes: building.holes },
    { ring: parcel.outer, holes: parcel.holes },
  );
}

function totalOverlapM2(building: Pick<BuildingFeat, "ring" | "holes">, parcels: ParcelPolygon[]): number {
  let sum = 0;
  for (const parcel of parcels) sum += overlapWithParcelM2(building, parcel);
  return sum;
}

/** More than half the footprint area must lie inside the parcel (multipolygon and holes). */
export function siteBuildingIdsFromParcel(
  buildings: BuildingFeat[],
  parcels: ParcelPolygon[],
  threshold = SITE_OVERLAP_FRACTION,
): number[] {
  const ids: number[] = [];
  for (const building of buildings) {
    const area = footprintAreaM2(building);
    if (!(area > 0)) continue;
    const overlap = totalOverlapM2(building, parcels);
    if (overlap / area > threshold) ids.push(building.id);
  }
  return ids;
}

/** When there is no parcel, pick the building whose footprint contains the geocoded point. */
export function siteBuildingIdsFromPoint(buildings: BuildingFeat[], point: Pt): number[] {
  for (const building of buildings) {
    if (pointInPolygon(point, building.ring, building.holes)) return [building.id];
  }
  return [];
}

export function isSiteBuilding(model: { siteBuildingIds?: number[] }, buildingId: number): boolean {
  return Boolean(model.siteBuildingIds?.includes(buildingId));
}

export type SiteBuildingOverlap = {
  id: number;
  overlapM2: number;
  footprintM2: number;
  overlapFraction: number;
  selected: boolean;
};

/** Overlap fractions for every building that meets the parcel at all (for QA). */
export function siteBuildingOverlaps(
  buildings: BuildingFeat[],
  parcels: ParcelPolygon[],
  threshold = SITE_OVERLAP_FRACTION,
): SiteBuildingOverlap[] {
  const rows: SiteBuildingOverlap[] = [];
  for (const building of buildings) {
    const footprintM2 = footprintAreaM2(building);
    if (!(footprintM2 > 0)) continue;
    const overlapM2 = totalOverlapM2(building, parcels);
    if (overlapM2 <= 0) continue;
    const overlapFraction = overlapM2 / footprintM2;
    rows.push({
      id: building.id,
      overlapM2,
      footprintM2,
      overlapFraction,
      selected: overlapFraction > threshold,
    });
  }
  return rows.sort((a, b) => b.overlapFraction - a.overlapFraction);
}
