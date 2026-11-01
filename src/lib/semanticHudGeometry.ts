import * as THREE from "three";
import { openRing, signedArea } from "./geo";
import {
  effectiveBuildingHeightM,
  heightTierLabel,
  inferHeightTier,
  STOREY_HEIGHT_M,
} from "./buildingHeightResolve";
import { buildingDisplayHeightM, buildingHeightSourceLabelForBuilding, footprintAreaM2 } from "./heightOverrides";
import type { BuildingFeat, Pt, RoadFeat } from "../types";

const scratchV3 = new THREE.Vector3();
const scratchNdc = new THREE.Vector3();

export function pointToSegmentDistanceM(point: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return Math.hypot(point[0] - px, point[1] - py);
}

export function nearestRoadAt(
  roads: RoadFeat[],
  at: Pt,
): { road: RoadFeat; distanceM: number; tangent: Pt } | null {
  let best: { road: RoadFeat; distanceM: number; tangent: Pt } | null = null;
  for (const road of roads) {
    if (road.kind !== "road" || road.grade === "path" || road.service) continue;
    const line = road.line;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const distanceM = pointToSegmentDistanceM(at, a, b);
      if (best && distanceM >= best.distanceM) continue;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      best = { road, distanceM, tangent: [dx / len, dy / len] };
    }
  }
  return best;
}

export function buildingCentroid(building: BuildingFeat): Pt {
  const ring = openRing(building.ring);
  if (ring.length === 0) return [0, 0];
  let east = 0;
  let north = 0;
  for (const [x, y] of ring) {
    east += x;
    north += y;
  }
  return [east / ring.length, north / ring.length];
}

export function buildingFootprintAreaM2(building: BuildingFeat): number {
  let area = Math.abs(signedArea(openRing(building.ring)));
  for (const hole of building.holes) area -= Math.abs(signedArea(openRing(hole)));
  return Math.max(area, 0);
}

export function buildingHudFloorField(building: BuildingFeat) {
  const heightM = buildingDisplayHeightM(building);
  const heightTier = inferHeightTier(building);
  const fromHeight = Math.max(1, Math.round(heightM / STOREY_HEIGHT_M));
  const recorded = building.developmentFloors ?? building.numFloors;
  if (recorded != null && recorded > 0) {
    const floorTier =
      building.developmentFloors != null && building.developmentFloors > 0
        ? ("development_floors" as const)
        : ("overture_floors" as const);
    const floorSource = heightTierLabel(floorTier);
    const impliedHeightM = recorded * STOREY_HEIGHT_M;
    const conflictsWithHeight = Math.abs(impliedHeightM - heightM) > STOREY_HEIGHT_M * 0.55;
    return {
      floors: recorded,
      floorsEstimated: false,
      floorsSource: floorSource,
      conflictNote: conflictsWithHeight
        ? `Floor record implies ~${impliedHeightM.toFixed(0)} m; height shown is ${heightM.toFixed(1)} m (${heightTierLabel(heightTier)})`
        : null,
      gfaFloors: conflictsWithHeight ? fromHeight : recorded,
      gfaFromHeight: conflictsWithHeight,
    };
  }
  return {
    floors: fromHeight,
    floorsEstimated: true,
    floorsSource: "Estimated from height",
    conflictNote: null,
    gfaFloors: fromHeight,
    gfaFromHeight: true,
  };
}

export function buildingHudStats(building: BuildingFeat) {
  const heightM = buildingDisplayHeightM(building);
  const heightSource = buildingHeightSourceLabelForBuilding(building);
  const floorField = buildingHudFloorField(building);
  const footprintM2 = footprintAreaM2(building);
  const gfaM2 = footprintM2 * floorField.gfaFloors;
  return {
    heightM,
    heightSource,
    floors: floorField.floors,
    floorsEstimated: floorField.floorsEstimated,
    floorsSource: floorField.floorsSource,
    conflictNote: floorField.conflictNote,
    footprintM2,
    gfaM2,
    gfaEstimated: true,
    gfaFromHeight: floorField.gfaFromHeight,
  };
}

export function projectWorldToScreen(
  camera: THREE.Camera,
  width: number,
  height: number,
  world: THREE.Vector3,
): { x: number; y: number; behind: boolean } | null {
  if (width < 2 || height < 2) return null;
  scratchNdc.copy(world).project(camera);
  if (!Number.isFinite(scratchNdc.x) || !Number.isFinite(scratchNdc.y)) return null;
  const behind = scratchNdc.z > 1;
  return {
    x: ((scratchNdc.x + 1) / 2) * width,
    y: ((1 - scratchNdc.y) / 2) * height,
    behind,
  };
}

export function buildingScreenFillRatio(
  camera: THREE.Camera,
  width: number,
  height: number,
  building: BuildingFeat,
  groundY: number,
): number {
  const heightM = effectiveBuildingHeightM(building);
  const ring = openRing(building.ring);
  if (ring.length < 3 || width < 2 || height < 2) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const [east, north] of ring) {
    scratchV3.set(east, groundY, -north);
    const projected = projectWorldToScreen(camera, width, height, scratchV3);
    if (!projected || projected.behind) continue;
    any = true;
    minX = Math.min(minX, projected.x);
    minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x);
    maxY = Math.max(maxY, projected.y);
    scratchV3.set(east, groundY + heightM, -north);
    const top = projectWorldToScreen(camera, width, height, scratchV3);
    if (!top || top.behind) continue;
    minX = Math.min(minX, top.x);
    minY = Math.min(minY, top.y);
    maxX = Math.max(maxX, top.x);
    maxY = Math.max(maxY, top.y);
  }
  if (!any || minX >= maxX || minY >= maxY) return 0;
  const boxArea = (maxX - minX) * (maxY - minY);
  return boxArea / (width * height);
}

export function lateralBuildingHeights(
  buildings: BuildingFeat[],
  at: Pt,
  tangent: Pt,
  maxCrossM = 40,
  maxAlongM = 40,
): { leftM: number | null; rightM: number | null } {
  const nx = -tangent[1];
  const ny = tangent[0];
  let leftM: number | null = null;
  let rightM: number | null = null;
  for (const building of buildings) {
    const c = buildingCentroid(building);
    const offset = (c[0] - at[0]) * nx + (c[1] - at[1]) * ny;
    if (Math.abs(offset) > maxCrossM) continue;
    const along = (c[0] - at[0]) * tangent[0] + (c[1] - at[1]) * tangent[1];
    if (along < -8 || along > maxAlongM) continue;
    const h = effectiveBuildingHeightM(building);
    if (offset < -1) leftM = leftM == null ? h : Math.max(leftM, h);
    if (offset > 1) rightM = rightM == null ? h : Math.max(rightM, h);
  }
  return { leftM, rightM };
}
