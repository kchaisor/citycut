import * as THREE from "three";
import { daylightWindowMinutes, sunAtMelbourneLocal } from "./solar";
import { buildFacadeOcclusionMesh } from "./facadeOcclusionMesh";
import { planToWorld, worldOutward3 } from "./facadeSolarTypes";
import { SUN_HOURS_GROUND_STEP_MINUTES, sunHoursDirectRgb, sunHoursGroundFromLitSteps } from "./sunHoursGround";
import { directSunHoursSamplesForModel, type DirectSunHoursSample } from "./sunHoursDirectSample";
import type { SunHoursGroundRaster } from "./sunHoursGroundRaster";
import { packSunHoursRoofRasterSource, type SunHoursRoofRasterSource } from "./sunHoursRoofPlanRaster";
import type { CityModel } from "../types";

const FACING_DOT_MIN = 0.04;
const RAY_MAX_M = 4000;
const SELF_SKIP_M = 0.05;
const WALL_OFFSET_M = 0.08;
const ROOF_OVERLAY_LIFT_M = 0.2;

export type SunHoursDirectOverlay = {
  positions: Float32Array;
  colors: Float32Array;
  roofPositions: Float32Array;
  roofColors: Float32Array;
  wallPositions: Float32Array;
  wallColors: Float32Array;
  cellCount: number;
  maxSunHours: number;
  roofPlanRaster: SunHoursGroundRaster | null;
  roofRasterSource: SunHoursRoofRasterSource | null;
};

function isLitAtStep(
  mesh: THREE.Mesh,
  sample: DirectSunHoursSample,
  sunDir: THREE.Vector3,
  aboveHorizon: boolean,
): boolean {
  if (!aboveHorizon) return false;
  if (sample.kind === "facade-bay") {
    const normal = worldOutward3(sample.outwardEast, sample.outwardNorth);
    const dot = normal[0] * sunDir.x + normal[1] * sunDir.y + normal[2] * sunDir.z;
    if (dot < FACING_DOT_MIN) return false;
  } else if (sunDir.y < FACING_DOT_MIN) return false;
  const origin = planToWorld(sample.east, sample.north, sample.yM);
  const ray = new THREE.Ray(new THREE.Vector3(origin[0], origin[1], origin[2]), sunDir);
  ray.origin.addScaledVector(ray.direction, SELF_SKIP_M);
  const hit = mesh.geometry.boundsTree?.raycastFirst(ray);
  return !hit || hit.distance > RAY_MAX_M;
}

function daylightSteps(lat: number, lon: number, year: number, month: number, day: number): { dir: THREE.Vector3; above: boolean }[] {
  const window = daylightWindowMinutes(lat, lon, year, month, day);
  if (!window) return [];
  const steps: { dir: THREE.Vector3; above: boolean }[] = [];
  for (let minuteOfDay = window.sunrise; minuteOfDay <= window.sunset; minuteOfDay += SUN_HOURS_GROUND_STEP_MINUTES) {
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

function buildOverlayMesh(
  samples: DirectSunHoursSample[],
  hours: Float32Array,
  maxSunHours: number,
): SunHoursDirectOverlay {
  const positions: number[] = [];
  const colors: number[] = [];
  const roofPositions: number[] = [];
  const roofColors: number[] = [];
  const wallPositions: number[] = [];
  const wallColors: number[] = [];
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    const half = sample.spanM * 0.5;
    const rgb = sunHoursDirectRgb(hours[index]!, maxSunHours);
    const [cx, cy, cz] = planToWorld(sample.east, sample.north, sample.yM);
    if (sample.kind === "facade-bay") {
      const [nx, , nz] = worldOutward3(sample.outwardEast, sample.outwardNorth);
      const len = Math.hypot(nx, nz) || 1;
      const tx = nz / len;
      const tz = -nx / len;
      const corner = (along: number, up: number) => [
        cx + tx * along + nx * WALL_OFFSET_M,
        cy + up,
        cz + tz * along + nz * WALL_OFFSET_M,
      ];
      const [a0, a1, a2] = corner(-half, -half);
      const [b0, b1, b2] = corner(half, -half);
      const [c0, c1, c2] = corner(half, half);
      const [d0, d1, d2] = corner(-half, half);
      pushQuad(wallPositions, wallColors, rgb, a0, a1, a2, b0, b1, b2, c0, c1, c2, d0, d1, d2);
      pushQuad(positions, colors, rgb, a0, a1, a2, b0, b1, b2, c0, c1, c2, d0, d1, d2);
    } else {
      pushQuad(
        roofPositions,
        roofColors,
        rgb,
        cx - half,
        cy + ROOF_OVERLAY_LIFT_M,
        cz - half,
        cx + half,
        cy + ROOF_OVERLAY_LIFT_M,
        cz - half,
        cx + half,
        cy + ROOF_OVERLAY_LIFT_M,
        cz + half,
        cx - half,
        cy + ROOF_OVERLAY_LIFT_M,
        cz + half,
      );
      pushQuad(
        positions,
        colors,
        rgb,
        cx - half,
        cy + ROOF_OVERLAY_LIFT_M,
        cz - half,
        cx + half,
        cy + ROOF_OVERLAY_LIFT_M,
        cz - half,
        cx + half,
        cy + ROOF_OVERLAY_LIFT_M,
        cz + half,
        cx - half,
        cy + ROOF_OVERLAY_LIFT_M,
        cz + half,
      );
    }
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    roofPositions: new Float32Array(roofPositions),
    roofColors: new Float32Array(roofColors),
    wallPositions: new Float32Array(wallPositions),
    wallColors: new Float32Array(wallColors),
    cellCount: samples.length,
    maxSunHours,
    roofPlanRaster: null,
    roofRasterSource: null,
  };
}

export function assessDirectSunHoursOverlay(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  scaleMaxHours?: number,
): SunHoursDirectOverlay | null {
  const samples = directSunHoursSamplesForModel(model);
  if (samples.length === 0) return null;
  const occlusionMesh = buildFacadeOcclusionMesh(model);
  if (!occlusionMesh) return null;
  const sunDirs = daylightSteps(model.center.lat, model.center.lon, year, month, day);
  if (sunDirs.length === 0) {
    occlusionMesh.geometry.disposeBoundsTree?.();
    occlusionMesh.geometry.dispose();
    return null;
  }
  const litCounts = new Uint16Array(samples.length);
  for (const { dir, above } of sunDirs) {
    if (!above) continue;
    for (let index = 0; index < samples.length; index++) {
      if (isLitAtStep(occlusionMesh, samples[index]!, dir, above)) litCounts[index]! += 1;
    }
  }
  occlusionMesh.geometry.disposeBoundsTree?.();
  occlusionMesh.geometry.dispose();
  const hours = new Float32Array(samples.length);
  let maxSunHours = 0;
  for (let index = 0; index < hours.length; index++) {
    const value = sunHoursGroundFromLitSteps(litCounts[index]!);
    hours[index] = value;
    maxSunHours = Math.max(maxSunHours, value);
  }
  const scale = Math.max(scaleMaxHours ?? 0, maxSunHours, 0.01);
  const overlay = buildOverlayMesh(samples, hours, scale);
  overlay.roofRasterSource = packSunHoursRoofRasterSource(samples, hours);
  return overlay;
}
