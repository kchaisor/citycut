import * as THREE from "three";
import { intersectionAreaM2 } from "./comBuildingHeightsMatch";
import { buildCityGroup, disposeObject } from "./buildCity";
import { dedupeAreas, dedupeBuildings, dedupeRoads } from "./footprints";
import { footpathStrips, unionFootpathStrips } from "./roadFill";
import { openRing, signedArea } from "./geo";
import { planPaths } from "./svgPlan";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import type { AreaFeat, BuildingFeat, CityModel, RoadFeat } from "../types";

function footprintArea(building: Pick<BuildingFeat, "ring" | "holes">): number {
  let area = Math.abs(signedArea(openRing(building.ring)));
  for (const hole of building.holes) area -= Math.abs(signedArea(openRing(hole)));
  return Math.max(area, 0);
}

function iou(a: Pick<BuildingFeat, "ring" | "holes">, b: Pick<BuildingFeat, "ring" | "holes">): number {
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

export type LayerDuplicateReport = {
  buildings: {
    overtureFragments: number;
    overtureAfterDedupe: number;
    removedByDedupe: number;
    comFootprints: number;
    comOvertureIouPairs: number;
    osmTaggedBuildings: number;
    duplicatePairsAfterDedupe: number;
  };
  roads: { beforeDedupe: number; afterDedupe: number };
  footpaths: { centrelineCount: number; unionPolygonCount: number };
  green: { beforeDedupe: number; afterDedupe: number };
  water: { beforeDedupe: number; afterDedupe: number };
  blocks: { count: number; blockBuildingIouPairs: number };
  exports: {
    threeDMeshNames: Record<string, number>;
    plan: { buildings: number; blocks: number; footpathRings: number; roads: number };
  };
};

export function comOvertureOverlapCount(
  buildings: BuildingFeat[],
  footprints: ComBuildingFootprint[],
  threshold = 0.35,
): number {
  let pairs = 0;
  for (const building of buildings) {
    for (const fp of footprints) {
      if (iou(building, fp) >= threshold) {
        pairs += 1;
        break;
      }
    }
  }
  return pairs;
}

export function blockBuildingStackingPairs(model: CityModel, threshold = 0.5): number {
  const blocks = model.blocks ?? [];
  let pairs = 0;
  for (const block of blocks) {
    for (const building of model.buildings) {
      if (iou(block, building) >= threshold) pairs += 1;
    }
  }
  return pairs;
}

export function countThreeDMeshesByName(model: CityModel): Record<string, number> {
  const group = buildCityGroup(model, { splitBuildings: true });
  const counts: Record<string, number> = {};
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.name) {
      counts[obj.name] = (counts[obj.name] ?? 0) + 1;
    }
  });
  disposeObject(group);
  return counts;
}

export function planLayerEmitCounts(model: CityModel): LayerDuplicateReport["exports"]["plan"] {
  const plan = planPaths(model, 2.5);
  return {
    buildings: plan.buildings.length,
    blocks: plan.blocks.length,
    footpathRings: plan.pathFill.length,
    roads: plan.roadFill.length,
  };
}

export function roadDedupeCounts(roads: RoadFeat[]): { beforeDedupe: number; afterDedupe: number } {
  const after = dedupeRoads(roads);
  return { beforeDedupe: roads.length, afterDedupe: after.roads.length };
}

export function areaDedupeCounts(areas: AreaFeat[]): { beforeDedupe: number; afterDedupe: number } {
  return { beforeDedupe: areas.length, afterDedupe: dedupeAreas(areas).length };
}

export function buildingDedupeCounts(buildings: BuildingFeat[]): {
  beforeDedupe: number;
  afterDedupe: number;
} {
  return { beforeDedupe: buildings.length, afterDedupe: dedupeBuildings(buildings).length };
}

export function footpathEmitCounts(model: CityModel): { centrelineCount: number; unionPolygonCount: number } {
  const lines = footpathStrips(model.roads, 2.5);
  const union = unionFootpathStrips(lines, model.sideM, model.frameShape ?? "square", 1.2, 2.5);
  return { centrelineCount: lines.length, unionPolygonCount: union.polygons.length };
}
