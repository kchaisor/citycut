import { toLocal } from "./geo";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, LonLat } from "../types";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";

/** Human-readable identity for landmark footprint assertions (OSM / Overture / CoM). */
export function landmarkFootprintDescriptor(
  building: BuildingFeat,
  options?: { lat: number; lon: number; center: LonLat; comFootprints?: ComBuildingFootprint[] },
): string {
  const parts: string[] = [`id:${building.id}`];
  if (building.overtureName) parts.push(building.overtureName);
  if (building.osmWayIds?.[0]) parts.push(`osm:way/${building.osmWayIds[0]}`);
  if (building.comMatchStructureId) parts.push(`CoM:${building.comMatchStructureId}`);
  if (options?.comFootprints?.length) {
    const at = toLocal(options.lat, options.lon, options.center);
    const ids = new Set<string>();
    for (const fp of options.comFootprints) {
      if (pointInPolygon(at, fp.ring, fp.holes)) ids.add(fp.id);
    }
    for (const id of [...ids].sort()) {
      if (id !== building.comMatchStructureId) parts.push(`CoM@${id}`);
    }
  }
  return parts.join(" · ");
}

export function footprintMatchesExpectations(descriptor: string, mustContain: string[]): boolean {
  const hay = descriptor.toLowerCase();
  return mustContain.every((needle) => hay.includes(needle.toLowerCase()));
}
