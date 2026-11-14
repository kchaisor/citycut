import { extrudePart } from "./buildCity";
import { openRing } from "./geo";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, Pt, Ring } from "../types";

const MIN_EXTRUSION_HEIGHT_M = 0.01;

const footprintCache = new WeakMap<BuildingFeat, ExtrudedFootprint[]>();

export type ExtrudedFootprint = {
  ring: Ring;
  holes: Ring[];
  height: number;
};

export type ExtrudedFootprintMaskPart = ExtrudedFootprint & {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
};

function footprintBounds(ring: Ring): { minE: number; maxE: number; minN: number; maxN: number } {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [east, north] of openRing(ring)) {
    minE = Math.min(minE, east);
    maxE = Math.max(maxE, east);
    minN = Math.min(minN, north);
    maxN = Math.max(maxN, north);
  }
  if (!Number.isFinite(minE)) return { minE: 0, maxE: 0, minN: 0, maxN: 0 };
  return { minE, maxE, minN, maxN };
}

function resolveExtrudedFootprints(building: BuildingFeat): ExtrudedFootprint[] {
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

export function extrudedFootprintsForBuilding(building: BuildingFeat): ExtrudedFootprint[] {
  const cached = footprintCache.get(building);
  if (cached) return cached;
  const footprints = resolveExtrudedFootprints(building);
  footprintCache.set(building, footprints);
  return footprints;
}

export function buildExtrudedFootprintMask(buildings: BuildingFeat[]): ExtrudedFootprintMaskPart[] {
  const mask: ExtrudedFootprintMaskPart[] = [];
  for (const building of buildings) {
    for (const part of extrudedFootprintsForBuilding(building)) {
      mask.push({ ...part, ...footprintBounds(part.ring) });
    }
  }
  return mask;
}

export function extrudedBuildingsForModel(buildings: BuildingFeat[]): BuildingFeat[] {
  return buildings.filter((building) => extrudedFootprintsForBuilding(building).length > 0);
}

export function planPointUnderExtrudedFootprintMask(
  mask: readonly ExtrudedFootprintMaskPart[],
  east: number,
  north: number,
): boolean {
  const point: Pt = [east, north];
  for (const part of mask) {
    if (east < part.minE || east > part.maxE || north < part.minN || north > part.maxN) continue;
    if (pointInPolygon(point, part.ring, part.holes)) return true;
  }
  return false;
}

export function planPointUnderExtrudedBuildingRoof(buildings: BuildingFeat[], east: number, north: number): boolean {
  return planPointUnderExtrudedFootprintMask(buildExtrudedFootprintMask(buildings), east, north);
}
