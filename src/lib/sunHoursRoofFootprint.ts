import * as THREE from "three";
import { planToWorld } from "./sunHoursWorld";
import {
  extrudedFootprintsForBuilding,
  extrudedBuildingsForModel,
  type ExtrudedFootprint,
} from "./extrudedBuildingFootprint";
import { openRing } from "./geo";
import { sunHoursDirectRgb } from "./sunHoursGround";
import { receivesSunHours } from "./sunHoursBuildings";
import { SURFACE } from "./surfaceLayers";
import { footprintBase } from "./terrain";
import type { DirectSunHoursSample } from "./sunHoursDirectSample";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

export const ROOF_OVERLAY_CLEARANCE_M = 0.15;

export function ringCentroid(ring: Ring): Pt {
  const open = openRing(ring);
  if (open.length === 0) return [0, 0];
  let sumE = 0;
  let sumN = 0;
  for (const [east, north] of open) {
    sumE += east;
    sumN += north;
  }
  return [sumE / open.length, sumN / open.length];
}

export function extrudedRoofTopYM(
  model: CityModel,
  building: BuildingFeat,
  part: Pick<ExtrudedFootprint, "height" | "base"> = building,
): number {
  const groundYM = model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0;
  return groundYM + SURFACE.building.lift + (part.base ?? 0) + part.height;
}

export function roofElevationYM(
  model: CityModel,
  building: BuildingFeat,
  part: Pick<ExtrudedFootprint, "height" | "base"> = building,
): number {
  return extrudedRoofTopYM(model, building, part) + ROOF_OVERLAY_CLEARANCE_M;
}

function roofHoursNearPlanPoint(
  buildingId: number,
  east: number,
  north: number,
  samples: DirectSunHoursSample[],
  hours: Float32Array,
): number {
  let bestDist = Infinity;
  let value = 0;
  let found = false;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    if (sample.kind !== "roof-cell" || sample.buildingId !== buildingId) continue;
    const dist = Math.hypot(sample.east - east, sample.north - north);
    if (dist < bestDist) {
      bestDist = dist;
      value = hours[index]!;
      found = true;
    }
  }
  if (found) return value;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    if (sample.kind !== "roof-cell" || sample.buildingId !== buildingId) continue;
    return hours[index]!;
  }
  return 0;
}

function pushRoofTriangle(
  roofPositions: number[],
  roofColors: number[],
  maxSunHours: number,
  yWorld: number,
  a: Pt,
  b: Pt,
  c: Pt,
  hoursA: number,
  hoursB: number,
  hoursC: number,
) {
  const corners: [Pt, number][] = [
    [a, hoursA],
    [b, hoursB],
    [c, hoursC],
  ];
  for (const [point, hour] of corners) {
    const [x, y, z] = planToWorld(point[0], point[1], yWorld);
    const rgb = sunHoursDirectRgb(hour, maxSunHours);
    roofPositions.push(x, y, z);
    roofColors.push(...rgb);
  }
}

function triangulateRoof(contour: THREE.Vector2[], holes: THREE.Vector2[][]) {
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  if (faces.length > 0 || holes.length === 0) return { faces, vertices: [...contour, ...holes.flat()] };
  return { faces: THREE.ShapeUtils.triangulateShape(contour, []), vertices: contour };
}

export function appendBuildingRoofFootprint(
  model: CityModel,
  building: BuildingFeat,
  samples: DirectSunHoursSample[],
  hours: Float32Array,
  maxSunHours: number,
  roofPositions: number[],
  roofColors: number[],
): number {
  const footprints = extrudedFootprintsForBuilding(building);
  if (footprints.length === 0) return 0;
  let triangles = 0;
  for (const part of footprints) {
    const open = openRing(part.ring);
    if (open.length < 3) continue;
    const contour = open.map(([east, north]) => new THREE.Vector2(east, north));
    const holeRings = part.holes
      .map((hole) => openRing(hole))
      .filter((hole) => hole.length >= 3)
      .map((hole) => hole.map(([east, north]) => new THREE.Vector2(east, north)));
    const { faces, vertices } = triangulateRoof(contour, holeRings);
    if (faces.length === 0) continue;
    const yWorld = roofElevationYM(model, building, part);
    for (const [ia, ib, ic] of faces) {
      const a = vertices[ia]!;
      const b = vertices[ib]!;
      const c = vertices[ic]!;
      const ap: Pt = [a.x, a.y];
      const bp: Pt = [b.x, b.y];
      const cp: Pt = [c.x, c.y];
      pushRoofTriangle(
        roofPositions,
        roofColors,
        maxSunHours,
        yWorld,
        ap,
        bp,
        cp,
        roofHoursNearPlanPoint(building.id, ap[0], ap[1], samples, hours),
        roofHoursNearPlanPoint(building.id, bp[0], bp[1], samples, hours),
        roofHoursNearPlanPoint(building.id, cp[0], cp[1], samples, hours),
      );
      triangles += 1;
    }
  }
  return triangles;
}

export function buildRoofFootprintMeshesForModel(
  model: CityModel,
  samples: DirectSunHoursSample[],
  hours: Float32Array,
  maxSunHours: number,
): { roofPositions: Float32Array; roofColors: Float32Array; buildingTriangles: Map<number, number> } {
  const roofPositions: number[] = [];
  const roofColors: number[] = [];
  const buildingTriangles = new Map<number, number>();
  for (const building of extrudedBuildingsForModel(model.buildings.filter(receivesSunHours))) {
    const count = appendBuildingRoofFootprint(model, building, samples, hours, maxSunHours, roofPositions, roofColors);
    buildingTriangles.set(building.id, count);
  }
  return {
    roofPositions: new Float32Array(roofPositions),
    roofColors: new Float32Array(roofColors),
    buildingTriangles,
  };
}

export function everyBuildingHasRoofFootprint(buildingTriangles: Map<number, number>, buildings: BuildingFeat[]): boolean {
  for (const building of extrudedBuildingsForModel(buildings.filter(receivesSunHours))) {
    if ((buildingTriangles.get(building.id) ?? 0) <= 0) return false;
  }
  return true;
}
