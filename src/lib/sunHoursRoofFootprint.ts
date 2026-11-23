import * as THREE from "three";
import { planToWorld } from "./sunHoursWorld";
import { clipPolygonRect } from "./clip";
import {
  extrudedFootprintsForBuilding,
  extrudedBuildingsForModel,
  type ExtrudedFootprint,
} from "./extrudedBuildingFootprint";
import { openRing } from "./geo";
import { SUN_HOURS_GROUND_CELL_M, sunHoursDirectRgb } from "./sunHoursGround";
import { receivesSunHours, sunHoursReceivers } from "./sunHoursBuildings";
import { SURFACE } from "./surfaceLayers";
import { footprintBase } from "./terrain";
import { pointInPolygon } from "./useCascade";
import type { DirectSunHoursSample } from "./sunHoursDirectSample";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

export const ROOF_OVERLAY_CLEARANCE_M = 0;

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

function hoursForRoofCell(
  buildingId: number,
  minE: number,
  maxE: number,
  minN: number,
  maxN: number,
  samples: DirectSunHoursSample[],
  hours: Float32Array,
): number {
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    if (sample.kind !== "roof-cell" || sample.buildingId !== buildingId) continue;
    if (sample.east >= minE && sample.east < maxE && sample.north >= minN && sample.north < maxN) {
      return hours[index]!;
    }
  }
  return roofHoursNearPlanPoint(buildingId, (minE + maxE) / 2, (minN + maxN) / 2, samples, hours);
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

function ringBounds(ring: Ring): { minE: number; maxE: number; minN: number; maxN: number } {
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
  return { minE, maxE, minN, maxN };
}

function clipRingToAxisRect(ring: Ring, minE: number, maxE: number, minN: number, maxN: number): Pt[] {
  const midE = (minE + maxE) / 2;
  const midN = (minN + maxN) / 2;
  const halfW = (maxE - minE) / 2;
  const halfH = (maxN - minN) / 2;
  if (!(halfW > 0) || !(halfH > 0)) return [];
  const shifted = openRing(ring).map(([east, north]) => [east - midE, north - midN] as Pt);
  return clipPolygonRect(shifted, halfW, halfH).map(([east, north]) => [east + midE, north + midN] as Pt);
}

function underTallerPart(point: Pt, part: ExtrudedFootprint, footprints: ExtrudedFootprint[]): boolean {
  const top = (part.base ?? 0) + part.height;
  return footprints.some(
    (other) => other !== part && (other.base ?? 0) + other.height > top && pointInPolygon(point, other.ring, other.holes),
  );
}

function appendClippedRoofCell(
  roofPositions: number[],
  roofColors: number[],
  maxSunHours: number,
  yWorld: number,
  hour: number,
  contour: Pt[],
  holes: Pt[][],
): number {
  if (contour.length < 3) return 0;
  const contourVec = contour.map(([east, north]) => new THREE.Vector2(east, north));
  const holeVec = holes
    .filter((hole) => hole.length >= 3)
    .map((hole) => hole.map(([east, north]) => new THREE.Vector2(east, north)));
  const { faces, vertices } = triangulateRoof(contourVec, holeVec);
  if (faces.length === 0) return 0;
  let triangles = 0;
  for (const [ia, ib, ic] of faces) {
    const a = vertices[ia]!;
    const b = vertices[ib]!;
    const c = vertices[ic]!;
    pushRoofTriangle(
      roofPositions,
      roofColors,
      maxSunHours,
      yWorld,
      [a.x, a.y],
      [b.x, b.y],
      [c.x, c.y],
      hour,
      hour,
      hour,
    );
    triangles += 1;
  }
  return triangles;
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
  const spanM =
    samples.find((sample) => sample.kind === "roof-cell" && sample.buildingId === building.id)?.spanM ??
    SUN_HOURS_GROUND_CELL_M;
  let triangles = 0;
  for (const part of footprints) {
    const open = openRing(part.ring);
    if (open.length < 3) continue;
    const yWorld = roofElevationYM(model, building, part);
    const { minE, maxE, minN, maxN } = ringBounds(part.ring);
    if (!Number.isFinite(minE) || !(spanM > 0)) continue;
    const startE = Math.floor(minE / spanM + 1e-9) * spanM;
    const startN = Math.floor(minN / spanM + 1e-9) * spanM;
    for (let cellE = startE; cellE < maxE - 1e-9; cellE += spanM) {
      for (let cellN = startN; cellN < maxN - 1e-9; cellN += spanM) {
        const x0 = cellE;
        const x1 = cellE + spanM;
        const y0 = cellN;
        const y1 = cellN + spanM;
        const clipped = clipRingToAxisRect(part.ring, x0, x1, y0, y1);
        if (clipped.length < 3) continue;
        const centroid = ringCentroid([...clipped, clipped[0]!]);
        if (footprints.length > 1 && underTallerPart(centroid, part, footprints)) continue;
        const holeClips = part.holes
          .map((hole) => clipRingToAxisRect(hole, x0, x1, y0, y1))
          .filter((hole) => hole.length >= 3);
        const hour = hoursForRoofCell(building.id, x0, x1, y0, y1, samples, hours);
        triangles += appendClippedRoofCell(roofPositions, roofColors, maxSunHours, yWorld, hour, clipped, holeClips);
      }
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
  const roofSamplesByBuilding = new Map<number, number[]>();
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    if (sample.kind !== "roof-cell") continue;
    const indices = roofSamplesByBuilding.get(sample.buildingId);
    if (indices) indices.push(index);
    else roofSamplesByBuilding.set(sample.buildingId, [index]);
  }
  for (const building of extrudedBuildingsForModel(sunHoursReceivers(model))) {
    const indices = roofSamplesByBuilding.get(building.id) ?? [];
    const count = appendBuildingRoofFootprint(
      model,
      building,
      indices.map((index) => samples[index]!),
      Float32Array.from(indices, (index) => hours[index]!),
      maxSunHours,
      roofPositions,
      roofColors,
    );
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
