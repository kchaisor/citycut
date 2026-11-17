import type { BuildingFeat, CityModel, Pt, Ring, TreeFeat } from "../types";
import { pointInRing } from "./useCascade";

type Footprint = { ring: Ring; minX: number; minY: number; maxX: number; maxY: number };

function footprint(ring: Ring): Footprint {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { ring, minX, minY, maxX, maxY };
}

function boxesOverlap(a: Footprint, b: Footprint): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function cross(p: Pt, q: Pt, r: Pt): number {
  return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

function edgesCross(a: Ring, b: Ring): boolean {
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i]!;
    const a1 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a0, a1, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  return false;
}

function ringsOverlap(a: Footprint, b: Footprint): boolean {
  return a.ring.some((p) => pointInRing(p, b.ring)) || b.ring.some((p) => pointInRing(p, a.ring)) || edgesCross(a.ring, b.ring);
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function discOverlaps(centre: Pt, radius: number, fp: Footprint): boolean {
  if (
    centre[0] + radius < fp.minX ||
    centre[0] - radius > fp.maxX ||
    centre[1] + radius < fp.minY ||
    centre[1] - radius > fp.maxY
  ) {
    return false;
  }
  if (pointInRing(centre, fp.ring)) return true;
  const ring = fp.ring;
  for (let i = 0; i < ring.length; i++) {
    if (segmentDistance(centre, ring[i]!, ring[(i + 1) % ring.length]!) < radius) return true;
  }
  return false;
}

export function windObstacleModel(model: CityModel, importedBuildings: BuildingFeat[]): CityModel {
  if (importedBuildings.length === 0) return model;
  const imports = importedBuildings.map((building) => footprint(building.ring));
  const underImport = (ring: Ring) => {
    const fp = footprint(ring);
    return imports.some((imp) => boxesOverlap(fp, imp) && ringsOverlap(fp, imp));
  };
  const treeUnderImport = (tree: TreeFeat) => imports.some((imp) => discOverlaps(tree.at, tree.crown_diameter_m / 2, imp));
  return {
    ...model,
    buildings: [...model.buildings.filter((building) => !underImport(building.ring)), ...importedBuildings],
    trees: model.trees.filter((tree) => !treeUnderImport(tree)),
  };
}
