import { effectiveBuildingHeightM } from "./buildingHeightResolve";
import { openRing, signedArea, toLocal } from "./geo";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, LonLat, Pt } from "../types";

function footprintAreaM2(building: Pick<BuildingFeat, "ring" | "holes">): number {
  let area = Math.abs(signedArea(openRing(building.ring)));
  for (const hole of building.holes) area -= Math.abs(signedArea(openRing(hole)));
  return Math.max(area, 0);
}

/** Height at a ground point: extrusion part containing the point, else tallest part on footprint. */
export function landmarkHeightAtPoint(building: BuildingFeat, at: Pt): number {
  const parts = building.extrusionParts;
  if (parts?.length) {
    const inside = parts.filter((part) => pointInPolygon(at, part.ring, part.holes));
    if (inside.length > 0) {
      return Math.max(...inside.map((part) => part.height));
    }
    return Math.max(...parts.map((part) => part.height));
  }
  return effectiveBuildingHeightM(building);
}

/**
 * Building whose footprint contains the point. Overlaps: prefer tallest mass at the point,
 * then larger footprint (DAM-style disambiguation).
 */
/** Landmark CI: footprint at the point that carries the expected OSM way id. */
export function pickBuildingForLandmark(
  buildings: BuildingFeat[],
  lat: number,
  lon: number,
  center: LonLat,
  osmWayId: number,
): { building: BuildingFeat; heightM: number; at: Pt } | null {
  const at = toLocal(lat, lon, center);
  const containing = buildings.filter((building) => pointInPolygon(at, building.ring, building.holes));
  const linked = containing.filter((building) => building.osmWayIds?.includes(osmWayId));
  if (linked.length === 0) return null;
  const building = linked.sort((a, b) => {
    const ha = landmarkHeightAtPoint(a, at);
    const hb = landmarkHeightAtPoint(b, at);
    if (hb !== ha) return hb - ha;
    return footprintAreaM2(b) - footprintAreaM2(a);
  })[0]!;
  return { building, heightM: landmarkHeightAtPoint(building, at), at };
}

export function pickBuildingAtPoint(
  buildings: BuildingFeat[],
  lat: number,
  lon: number,
  center: LonLat,
): { building: BuildingFeat; heightM: number; at: Pt } | null {
  const at = toLocal(lat, lon, center);
  const containing = buildings.filter((building) => pointInPolygon(at, building.ring, building.holes));
  if (containing.length === 0) return null;
  const building = containing.sort((a, b) => {
    const ha = landmarkHeightAtPoint(a, at);
    const hb = landmarkHeightAtPoint(b, at);
    if (hb !== ha) return hb - ha;
    return footprintAreaM2(b) - footprintAreaM2(a);
  })[0]!;
  return { building, heightM: landmarkHeightAtPoint(building, at), at };
}
