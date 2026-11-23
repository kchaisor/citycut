import * as THREE from "three";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "./solar";
import { buildFacadeOcclusionMesh } from "./facadeOcclusionMesh";
import { planToWorld, worldOutward3 } from "./sunHoursWorld";
import { sunHoursDirectRgb, sunHoursGroundFromLitSteps } from "./sunHoursGround";
import { directSunHoursSampleSet, type DirectSunHoursSample } from "./sunHoursDirectSample";
import { FAST_SUN_HOURS_PARAMS, type SunHoursSampleParams } from "./sunHoursQuality";
import { buildRoofFootprintMeshesForModel } from "./sunHoursRoofFootprint";
import type { SunHoursGroundRaster } from "./sunHoursGroundRaster";
import { packSunHoursRoofRasterSource, type SunHoursRoofRasterSource } from "./sunHoursRoofPlanRaster";
import type { CityModel, Ring } from "../types";
import { reportSunHoursStep, type SunHoursProgressCallback } from "./sunHoursProgress";
import { extrudedFootprintsForBuilding } from "./extrudedBuildingFootprint";
import { openRing } from "./geo";
import { footprintBase } from "./terrain";
import { SURFACE } from "./surfaceLayers";
import { sunHoursReceivers } from "./sunHoursBuildings";

const FACING_DOT_MIN = 0.04;
const RAY_MAX_M = 4000;
const SELF_SKIP_M = 0.05;

export type SunHoursDirectOverlay = {
  positions: Float32Array;
  colors: Float32Array;
  roofPositions: Float32Array;
  roofColors: Float32Array;
  wallPositions: Float32Array;
  wallColors: Float32Array;
  cellCount: number;
  maxSunHours: number;
  cellM: number;
  wallCellM: number;
  roofCellM: number;
  stepMinutes: number;
  roofPlanRaster: SunHoursGroundRaster | null;
  roofRasterSource: SunHoursRoofRasterSource | null;
};

function isLitAtStep(
  mesh: THREE.Mesh,
  sample: DirectSunHoursSample,
  sunDir: THREE.Vector3,
  aboveHorizon: boolean,
  ray: THREE.Ray,
): boolean {
  if (!aboveHorizon) return false;
  if (sample.kind === "facade-bay") {
    const normal = worldOutward3(sample.outwardEast, sample.outwardNorth);
    const dot = normal[0] * sunDir.x + normal[1] * sunDir.y + normal[2] * sunDir.z;
    if (dot < FACING_DOT_MIN) return false;
  } else if (sunDir.y < FACING_DOT_MIN) return false;
  const origin = planToWorld(sample.east, sample.north, sample.yM);
  ray.origin.set(origin[0], origin[1], origin[2]);
  ray.direction.copy(sunDir);
  ray.origin.addScaledVector(ray.direction, SELF_SKIP_M);
  const hit = mesh.geometry.boundsTree?.raycastFirst(ray);
  return !hit || hit.distance > RAY_MAX_M;
}

export function daylightSteps(
  lat: number,
  lon: number,
  year: number,
  month: number,
  day: number,
  stepMinutes: number,
): { dir: THREE.Vector3; above: boolean }[] {
  const window = daylightWindowMinutes(lat, lon, year, month, day);
  if (!window) return [];
  const steps: { dir: THREE.Vector3; above: boolean }[] = [];
  for (let minuteOfDay = window.sunrise; minuteOfDay <= window.sunset; minuteOfDay += stepMinutes) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const sample = sunAtMelbourneLocal(lat, lon, year, month, day, hour, minute);
    if (!sample.aboveHorizon) continue;
    const dir = new THREE.Vector3(sample.direction[0], sample.direction[1], sample.direction[2]);
    dir.normalize();
    steps.push({ dir, above: true });
  }
  return steps;
}

function pushQuad(
  positions: number[],
  colors: number[],
  color: [number, number, number],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
) {
  const tri = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    colors.push(...color);
  };
  tri(ax, ay, az);
  tri(bx, by, bz);
  tri(cx, cy, cz);
  tri(ax, ay, az);
  tri(cx, cy, cz);
  tri(dx, dy, dz);
}

function visibleWallBaseYM(model: CityModel, ring: Ring): number {
  return (model.terrain ? footprintBase(model.terrain, ring, model.sideM) : 0) + SURFACE.building.lift;
}

function appendWallFacesForModel(
  model: CityModel,
  samples: DirectSunHoursSample[],
  hours: Float32Array,
  maxSunHours: number,
  wallPositions: number[],
  wallColors: number[],
) {
  const hoursById = new Map<string, number>();
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    if (sample.kind !== "facade-bay") continue;
    hoursById.set(sample.id, hours[index]!);
  }
  for (const building of sunHoursReceivers(model)) {
    const footprints = extrudedFootprintsForBuilding(building);
    if (footprints.length === 0) continue;
    const baseYM = visibleWallBaseYM(model, building.ring);
    for (const [partIndex, part] of footprints.entries()) {
      const open = openRing(part.ring);
      if (open.length < 3) continue;
      const closed = [...open, open[0]!];
      const partBaseYM = baseYM + (part.base ?? 0);
      const heightM = Math.max(0.5, part.height);
      const cellM = samples.find((sample) => sample.kind === "facade-bay" && sample.buildingId === building.id)?.spanM;
      if (!(cellM && cellM > 0)) continue;
      for (let edge = 0; edge < closed.length - 1; edge++) {
        const a = closed[edge]!;
        const b = closed[edge + 1]!;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        if (length < 0.35) continue;
        const bayCount = Math.max(1, Math.ceil(length / cellM));
        const bandCount = Math.max(1, Math.ceil(heightM / cellM));
        for (let bay = 0; bay < bayCount; bay++) {
          const along0 = bay * cellM;
          const along1 = Math.min(length, (bay + 1) * cellM);
          for (let band = 0; band < bandCount; band++) {
            const id = `direct-wall-${building.id}-p${partIndex}-e${edge}-b${bay}-u${band}`;
            if (!hoursById.has(id)) continue;
            const rgb = sunHoursDirectRgb(hoursById.get(id)!, maxSunHours);
            const up0 = band * cellM;
            const up1 = Math.min(heightM, (band + 1) * cellM);
            const at = (along: number, up: number) => {
              const t = along / length;
              return planToWorld(a[0] + dx * t, a[1] + dy * t, partBaseYM + up);
            };
            const [ax, ay, az] = at(along0, up0);
            const [bx, by, bz] = at(along1, up0);
            const [cx, cy, cz] = at(along1, up1);
            const [dx_, dy_, dz] = at(along0, up1);
            pushQuad(wallPositions, wallColors, rgb, ax, ay, az, bx, by, bz, cx, cy, cz, dx_, dy_, dz);
          }
        }
      }
    }
  }
}

export function buildSunHoursFaceMeshes(
  model: CityModel,
  samples: DirectSunHoursSample[],
  hours: Float32Array,
  maxSunHours: number,
  resolution: { cellM: number; wallCellM: number; roofCellM: number; stepMinutes: number },
): SunHoursDirectOverlay {
  const wallPositions: number[] = [];
  const wallColors: number[] = [];
  appendWallFacesForModel(model, samples, hours, maxSunHours, wallPositions, wallColors);
  const { roofPositions, roofColors } = buildRoofFootprintMeshesForModel(model, samples, hours, maxSunHours);
  const wallPos = new Float32Array(wallPositions);
  const wallCol = new Float32Array(wallColors);
  return {
    positions: wallPos,
    colors: wallCol,
    roofPositions,
    roofColors,
    wallPositions: wallPos,
    wallColors: wallCol,
    cellCount: samples.length,
    maxSunHours,
    ...resolution,
    roofPlanRaster: null,
    roofRasterSource: null,
  };
}

export function directSunHoursAtSamples(
  model: CityModel,
  samples: DirectSunHoursSample[],
  year: number,
  month: number,
  day: number,
  stepMinutes: number,
  onProgress?: SunHoursProgressCallback,
): Float32Array | null {
  if (samples.length === 0) return null;
  const occlusionMesh = buildFacadeOcclusionMesh(model);
  if (!occlusionMesh) return null;
  const sunDirs = daylightSteps(model.center.lat, model.center.lon, year, month, day, stepMinutes);
  const litCounts = new Uint16Array(samples.length);
  const ray = new THREE.Ray();
  const dirTotal = sunDirs.length;
  let dirDone = 0;
  for (const { dir, above } of sunDirs) {
    dirDone++;
    reportSunHoursStep(onProgress, dirDone, dirTotal);
    if (!above) continue;
    for (let index = 0; index < samples.length; index++) {
      if (isLitAtStep(occlusionMesh, samples[index]!, dir, above, ray)) litCounts[index]! += 1;
    }
  }
  occlusionMesh.geometry.disposeBoundsTree?.();
  occlusionMesh.geometry.dispose();
  if (sunDirs.length === 0) return null;
  return Float32Array.from(litCounts, (count) => sunHoursGroundFromLitSteps(count, stepMinutes));
}

export function assessDirectSunHoursOverlay(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  scaleMaxHours?: number,
  params: SunHoursSampleParams = FAST_SUN_HOURS_PARAMS,
  onProgress?: SunHoursProgressCallback,
): SunHoursDirectOverlay | null {
  const { samples, wallCellM, roofCellM } = directSunHoursSampleSet(model, params);
  const { stepMinutes } = params;
  const hours = directSunHoursAtSamples(model, samples, year, month, day, stepMinutes, onProgress);
  if (!hours) return null;
  let maxSunHours = 0;
  for (const value of hours) maxSunHours = Math.max(maxSunHours, value);
  const scale = Math.max(scaleMaxHours ?? 0, maxSunHours, 0.01);
  const overlay = buildSunHoursFaceMeshes(model, samples, hours, scale, {
    cellM: params.cellM,
    wallCellM,
    roofCellM,
    stepMinutes,
  });
  overlay.roofRasterSource = packSunHoursRoofRasterSource(samples, hours);
  return overlay;
}
