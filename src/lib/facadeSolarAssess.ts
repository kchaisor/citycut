import * as THREE from "three";
import { sunAtMelbourneLocal } from "./solar";
import { buildFacadeOcclusionMesh } from "./facadeOcclusionMesh";
import {
  ADG_4A1_PROXY_NOTE,
  FACADE_RULES,
  summarizeFacadeUnits,
  VIC_D8_PROXY_NOTE,
  vicD8ExtraPass,
} from "./facadeSolarRules";
import { facadeBayUnitsForModel, podiumReceptorUnitsForModel } from "./facadeSolarSample";
import { FACADE_PODIUM_GRID_M, planToWorld, worldOutward3, type FacadeAssessBundle, type FacadeUnitResult, type FacadeUnitSample } from "./facadeSolarTypes";
import type { CityModel } from "../types";

const FACING_DOT_MIN = 0.04;
const RAY_MAX_M = 4000;
const SELF_SKIP_M = 0.05;

function isLitAtStep(
  mesh: THREE.Mesh,
  sample: FacadeUnitSample,
  sunDir: THREE.Vector3,
  aboveHorizon: boolean,
): boolean {
  if (!aboveHorizon) return false;
  if (sample.kind === "facade-bay") {
    const normal = worldOutward3(sample.outwardEast, sample.outwardNorth);
    const dot = normal[0] * sunDir.x + normal[1] * sunDir.y + normal[2] * sunDir.z;
    if (dot < FACING_DOT_MIN) return false;
  } else {
    if (sunDir.y < FACING_DOT_MIN) return false;
  }
  const origin = planToWorld(sample.east, sample.north, sample.yM);
  const ray = new THREE.Ray(
    new THREE.Vector3(origin[0], origin[1], origin[2]),
    sunDir.clone().normalize(),
  );
  ray.origin.addScaledVector(ray.direction, SELF_SKIP_M);
  const hit = mesh.geometry.boundsTree?.raycastFirst(ray);
  return !hit || hit.distance > RAY_MAX_M;
}

function assessUnits(
  model: CityModel,
  lat: number,
  lon: number,
  year: number,
  samples: FacadeUnitSample[],
  thresholdHours: number,
  month: number,
  day: number,
  hours: readonly number[],
): FacadeUnitResult[] {
  const mesh = buildFacadeOcclusionMesh(model);
  if (!mesh || samples.length === 0) return [];
  const sunDirs = hours.map((hour) => {
    const sample = sunAtMelbourneLocal(lat, lon, year, month, day, hour, 0);
    const dir = new THREE.Vector3(sample.direction[0], sample.direction[1], sample.direction[2]);
    return { dir, above: sample.aboveHorizon };
  });
  const litCounts = new Uint8Array(samples.length);
  for (const { dir, above } of sunDirs) {
    for (let index = 0; index < samples.length; index++) {
      if (isLitAtStep(mesh, samples[index]!, dir, above)) litCounts[index]! += 1;
    }
  }
  mesh.geometry.disposeBoundsTree?.();
  mesh.geometry.dispose();
  return samples.map((sample, index) => {
    const hoursDirect = litCounts[index] ?? 0;
    return {
      id: sample.id,
      kind: sample.kind,
      buildingId: sample.buildingId,
      floor: sample.floor,
      east: sample.east,
      north: sample.north,
      yM: sample.yM,
      hoursDirect,
      meetsThreshold: hoursDirect + 1e-6 >= thresholdHours,
      none: hoursDirect < 0.5,
    };
  });
}

export function assessFacadeSolar(
  model: CityModel,
  lat: number,
  lon: number,
  year: number,
): FacadeAssessBundle {
  const start = performance.now();
  const facadeRule = FACADE_RULES["nsw-adg-4a1"];
  const podiumRule = FACADE_RULES["vic-d8-b37-podium"];
  const facadeSamples = facadeBayUnitsForModel(model);
  const podiumSamples = podiumReceptorUnitsForModel(model);
  const facadeUnits = assessUnits(
    model,
    lat,
    lon,
    year,
    facadeSamples,
    facadeRule.thresholdHours,
    facadeRule.month,
    facadeRule.day,
    facadeRule.hours,
  );
  const podiumUnits = assessUnits(
    model,
    lat,
    lon,
    year,
    podiumSamples,
    podiumRule.thresholdHours,
    podiumRule.month,
    podiumRule.day,
    podiumRule.hours,
  );
  const assessMs = performance.now() - start;
  return {
    assessMs,
    facade:
      facadeUnits.length > 0
        ? summarizeFacadeUnits(facadeRule, ADG_4A1_PROXY_NOTE, facadeUnits, assessMs)
        : null,
    podium:
      podiumUnits.length > 0
        ? summarizeFacadeUnits(podiumRule, VIC_D8_PROXY_NOTE, podiumUnits, assessMs, (units) =>
            vicD8ExtraPass(units, FACADE_PODIUM_GRID_M),
          )
        : null,
  };
}

export function facadeHoursFill(
  hoursDirect: number,
  threshold: number,
): "--facade-hours-ok" | "--facade-hours-none" | "--facade-hours-warn" | "--facade-hours-low" {
  if (hoursDirect + 1e-6 >= threshold) return "--facade-hours-ok";
  if (hoursDirect < 0.5) return "--facade-hours-none";
  if (hoursDirect + 1e-6 >= threshold - 1) return "--facade-hours-warn";
  return "--facade-hours-low";
}

export type FacadeOverlayPoint = {
  id: string;
  east: number;
  north: number;
  yM: number;
  hoursDirect: number;
  fill: ReturnType<typeof facadeHoursFill>;
};

export function facadeOverlayPoints(bundle: FacadeAssessBundle | null): FacadeOverlayPoint[] {
  if (!bundle) return [];
  return [bundle.facade, bundle.podium].flatMap((summary) =>
    (summary?.units ?? []).map((unit) => ({
      id: unit.id,
      east: unit.east,
      north: unit.north,
      yM: unit.yM,
      hoursDirect: unit.hoursDirect,
      fill: facadeHoursFill(unit.hoursDirect, summary!.thresholdHours),
    })),
  );
}
