import { intersectionAreaM2 } from "./comBuildingHeightsMatch";
import { openRing, signedArea } from "./geo";
import type { AreaFeat, BuildingFeat, CityModel } from "../types";

function footprintArea(building: BuildingFeat): number {
  let area = Math.abs(signedArea(openRing(building.ring)));
  for (const hole of building.holes) area -= Math.abs(signedArea(openRing(hole)));
  return Math.max(area, 0);
}

function iou(a: BuildingFeat, b: BuildingFeat): number {
  const inter = intersectionAreaM2(a, b);
  if (inter <= 0) return 0;
  const areaA = footprintArea(a);
  const areaB = footprintArea(b);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

export type DuplicateAuditCounts = {
  buildingsBefore: number;
  buildingsAfter: number;
  buildingPairsRemoved: number;
  blockPolygons: number;
  greenPolygons: number;
  waterPolygons: number;
  duplicateBuildingPairs: { a: number; b: number; iou: number }[];
};

/** Fail when two kept footprints overlap heavily (IoU > 0.5). */
export function findDuplicateBuildingPairs(
  buildings: BuildingFeat[],
  threshold = 0.5,
): { a: number; b: number; iou: number }[] {
  const pairs: { a: number; b: number; iou: number }[] = [];
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const overlap = iou(buildings[i], buildings[j]);
      if (overlap > threshold) pairs.push({ a: buildings[i].id, b: buildings[j].id, iou: overlap });
    }
  }
  return pairs;
}

export function layerCountsForModel(model: CityModel): DuplicateAuditCounts {
  const blocks = model.blocks ?? [];
  const greens = model.areas.filter((a) => a.kind === "green");
  const waters = model.areas.filter((a) => a.kind === "water");
  return {
    buildingsBefore: model.buildings.length,
    buildingsAfter: model.buildings.length,
    buildingPairsRemoved: 0,
    blockPolygons: blocks.length,
    greenPolygons: greens.length,
    waterPolygons: waters.length,
    duplicateBuildingPairs: findDuplicateBuildingPairs(model.buildings),
  };
}

export function findDuplicateSurfaceEmits(areas: AreaFeat[]): string[] {
  const issues: string[] = [];
  const byKind = new Map<string, AreaFeat[]>();
  for (const area of areas) {
    const list = byKind.get(area.kind) ?? [];
    list.push(area);
    byKind.set(area.kind, list);
  }
  for (const [kind, list] of byKind) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const inter = intersectionAreaM2(
          { ring: list[i].ring, holes: list[i].holes },
          { ring: list[j].ring, holes: list[j].holes },
        );
        const a = Math.abs(signedArea(openRing(list[i].ring)));
        if (a > 0 && inter / a > 0.95) {
          issues.push(`${kind} polygons ${list[i].id} and ${list[j].id} overlap >95%`);
        }
      }
    }
  }
  return issues;
}
