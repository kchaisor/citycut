import * as THREE from "three";
import { planToWorld } from "./facadeSolarTypes";
import { extrudedFootprintsForBuilding, extrudedBuildingsForModel } from "./extrudedBuildingFootprint";
import { openRing } from "./geo";
import { sunHoursDirectRgb } from "./sunHoursGround";
import { footprintBase } from "./terrain";
import type { DirectSunHoursSample } from "./sunHoursDirectSample";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

export const ROOF_OVERLAY_LIFT_M = 0.2;
const BUILDING_SURFACE_LIFT_M = 0.05;

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

export function roofElevationYM(model: CityModel, building: BuildingFeat, heightM = building.height): number {
  const baseYM =
    (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + BUILDING_SURFACE_LIFT_M;
  return baseYM + heightM - 0.04;
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
    const [x, y, z] = planToWorld(point[0], point[1], yWorld - ROOF_OVERLAY_LIFT_M);
    const rgb = sunHoursDirectRgb(hour, maxSunHours);
    roofPositions.push(x, y + ROOF_OVERLAY_LIFT_M, z);
    roofColors.push(...rgb);
  }
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
    const faces = THREE.ShapeUtils.triangulateShape(contour, holeRings);
    const vertices = [...contour, ...holeRings.flat()];
    if (faces.length === 0) continue;
    const yWorld = roofElevationYM(model, building, part.height);
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
  for (const building of extrudedBuildingsForModel(model.buildings)) {
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
  for (const building of extrudedBuildingsForModel(buildings)) {
    if ((buildingTriangles.get(building.id) ?? 0) <= 0) return false;
  }
  return true;
}
