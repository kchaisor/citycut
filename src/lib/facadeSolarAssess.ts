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
import { getColour } from "./colours";
import {
  FACADE_BAY_WIDTH_M,
  FACADE_PODIUM_GRID_M,
  FACADE_WALL_OFFSET_M,
  planToWorld,
  worldOutward3,
  type FacadeAssessBundle,
  type FacadeUnitKind,
  type FacadeUnitResult,
  type FacadeUnitSample,
} from "./facadeSolarTypes";
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
      outwardEast: sample.outwardEast,
      outwardNorth: sample.outwardNorth,
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
  kind: FacadeUnitKind;
  east: number;
  north: number;
  yM: number;
  outwardEast: number;
  outwardNorth: number;
  hoursDirect: number;
  fill: ReturnType<typeof facadeHoursFill>;
};

export type FacadeOverlayCellNormal = {
  id: string;
  kind: FacadeUnitKind;
  nx: number;
  ny: number;
  nz: number;
};

const FACADE_CELL_WIDTH_M = FACADE_BAY_WIDTH_M * 0.9;
const FACADE_CELL_HEIGHT_M = 2.35;
const PODIUM_CELL_M = FACADE_PODIUM_GRID_M * 0.88;

export function facadeOverlayPoints(bundle: FacadeAssessBundle | null): FacadeOverlayPoint[] {
  if (!bundle) return [];
  return [bundle.facade, bundle.podium].flatMap((summary) =>
    (summary?.units ?? []).map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      east: unit.east,
      north: unit.north,
      yM: unit.yM,
      outwardEast: unit.outwardEast,
      outwardNorth: unit.outwardNorth,
      hoursDirect: unit.hoursDirect,
      fill: facadeHoursFill(unit.hoursDirect, summary!.thresholdHours),
    })),
  );
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

export function facadeOverlayCellNormals(bundle: FacadeAssessBundle): FacadeOverlayCellNormal[] {
  const overlay = facadeOverlayPoints(bundle);
  return overlay
    .filter((point) => point.kind === "facade-bay")
    .map((point) => {
      const [nx, ny, nz] = worldOutward3(point.outwardEast, point.outwardNorth);
      return { id: point.id, kind: point.kind, nx, ny, nz };
    });
}

export function buildFacadeWallOverlayMesh(bundle: FacadeAssessBundle): {
  positions: Float32Array;
  colors: Float32Array;
} {
  return buildFacadeOverlayMesh(bundle, (point) => point.kind === "facade-bay");
}

export function buildFacadeOverlayMesh(
  bundle: FacadeAssessBundle,
  includePoint: (point: FacadeOverlayPoint) => boolean = () => true,
): {
  positions: Float32Array;
  colors: Float32Array;
  cellCount: number;
} {
  const overlay = facadeOverlayPoints(bundle).filter(includePoint);
  const positions: number[] = [];
  const colors: number[] = [];
  const fillColours = new Map<string, [number, number, number]>();
  for (const point of overlay) {
    if (!fillColours.has(point.fill)) {
      const c = new THREE.Color(getColour(point.fill));
      fillColours.set(point.fill, [c.r, c.g, c.b]);
    }
  }
  for (const point of overlay) {
    const colour = fillColours.get(point.fill)!;
    const [cx, cy, cz] = planToWorld(point.east, point.north, point.yM);
    if (point.kind === "facade-bay") {
      const [nx, , nz] = worldOutward3(point.outwardEast, point.outwardNorth);
      const len = Math.hypot(nx, nz) || 1;
      const tx = nz / len;
      const tz = -nx / len;
      const hw = FACADE_CELL_WIDTH_M * 0.5;
      const hh = FACADE_CELL_HEIGHT_M * 0.5;
      const offset = FACADE_WALL_OFFSET_M;
      const corner = (along: number, up: number) => [
        cx + tx * along + nx * offset,
        cy + up,
        cz + tz * along + nz * offset,
      ];
      const [a0, a1, a2] = corner(-hw, -hh);
      const [b0, b1, b2] = corner(hw, -hh);
      const [c0, c1, c2] = corner(hw, hh);
      const [d0, d1, d2] = corner(-hw, hh);
      pushQuad(positions, colors, colour, a0, a1, a2, b0, b1, b2, c0, c1, c2, d0, d1, d2);
    } else {
      const half = PODIUM_CELL_M * 0.5;
      pushQuad(
        positions,
        colors,
        colour,
        cx - half,
        cy + 0.04,
        cz - half,
        cx + half,
        cy + 0.04,
        cz - half,
        cx + half,
        cy + 0.04,
        cz + half,
        cx - half,
        cy + 0.04,
        cz + half,
      );
    }
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    cellCount: overlay.length,
  };
}
