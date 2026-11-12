import { extrudePart } from "./buildCity";
import { openRing } from "./geo";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, Pt, Ring } from "../types";

const MIN_EXTRUSION_HEIGHT_M = 0.01;

export type ExtrudedFootprint = {
  ring: Ring;
  holes: Ring[];
  height: number;
};

export function extrudedFootprintsForBuilding(building: BuildingFeat): ExtrudedFootprint[] {
  if (building.meshDrawnBy != null) return [];
  const parts =
    building.extrusionParts && building.extrusionParts.length > 0
      ? building.extrusionParts
      : [{ ring: building.ring, holes: building.holes ?? [], height: building.height }];
  const footprints: ExtrudedFootprint[] = [];
  for (const part of parts) {
    if (part.height < MIN_EXTRUSION_HEIGHT_M) continue;
    const holes = part.holes ?? [];
    if (openRing(part.ring).length < 3) continue;
    const geometry = extrudePart(part.ring, holes, part.height, 0);
    if (!geometry) continue;
    geometry.dispose();
    footprints.push({ ring: part.ring, holes, height: part.height });
  }
  return footprints;
}

export function extrudedBuildingsForModel(buildings: BuildingFeat[]): BuildingFeat[] {
  return buildings.filter((building) => extrudedFootprintsForBuilding(building).length > 0);
}

export function planPointUnderExtrudedBuildingRoof(buildings: BuildingFeat[], east: number, north: number): boolean {
  const point: Pt = [east, north];
  for (const building of buildings) {
    for (const part of extrudedFootprintsForBuilding(building)) {
      if (pointInPolygon(point, part.ring, part.holes)) return true;
    }
  }
  return false;
}
