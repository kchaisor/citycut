import { openRing } from "../geo";
import { sampleTerrain } from "../terrain";
import type { BuildingFeat, CityModel } from "../../types";
import { floorLinesForBuilding, type SectionFloorLine } from "./floors";
import { knifeNormalXZ, type SectionKnifePose } from "./plane";

export type SectionProfile = {
  id: number;
  tangentMin: number;
  tangentMax: number;
  baseY: number;
  topY: number;
  floors: SectionFloorLine[];
};

export type SectionAxis = {
  normal: { x: number; z: number };
  tangent: { x: number; z: number };
  originX: number;
  originZ: number;
  offsetM: number;
  halfWidth: number;
};

function sceneZ(north: number): number {
  return -north;
}

function tangentCoord(x: number, z: number, tangent: { x: number; z: number }): number {
  return x * tangent.x + z * tangent.z;
}

function signedPlaneDistance(x: number, z: number, normal: { x: number; z: number }, offsetM: number): number {
  return normal.x * x + normal.z * z - offsetM;
}

function intersectEdgeWithPlane(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  normal: { x: number; z: number },
  offsetM: number,
): { x: number; z: number } | null {
  const da = signedPlaneDistance(ax, az, normal, offsetM);
  const db = signedPlaneDistance(bx, bz, normal, offsetM);
  if (da === 0 && db === 0) return { x: ax, z: az };
  if (da * db > 0) return null;
  const u = da / (da - db);
  return { x: ax + (bx - ax) * u, z: az + (bz - az) * u };
}

function profileFromRing(
  ring: readonly [number, number][],
  building: BuildingFeat,
  axis: SectionAxis,
  groundY: number,
  terrain: CityModel["terrain"],
  sideM: number,
): SectionProfile | null {
  const normal = axis.normal;
  const offsetM = axis.offsetM;
  const pts = openRing([...ring]);
  const tValues: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [e0, n0] = pts[i]!;
    const [e1, n1] = pts[(i + 1) % pts.length]!;
    const hit = intersectEdgeWithPlane(e0, sceneZ(n0), e1, sceneZ(n1), normal, offsetM);
    if (hit) tValues.push(tangentCoord(hit.x, hit.z, axis.tangent));
  }
  let minD = Infinity;
  let maxD = -Infinity;
  for (const [e, n] of pts) {
    const d = signedPlaneDistance(e, sceneZ(n), normal, offsetM);
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
    if (Math.abs(d) < 4) tValues.push(tangentCoord(e, sceneZ(n), axis.tangent));
  }
  if (minD > 3 && maxD > 3) return null;
  if (maxD < -3 && minD < -3) return null;
  if (tValues.length === 0) return null;
  let tMin = Math.min(...tValues);
  let tMax = Math.max(...tValues);
  if (tMax - tMin < 0.35) return null;

  const midT = (tMin + tMax) / 2;
  const midX = axis.originX + axis.tangent.x * midT;
  const midZ = axis.originZ + axis.tangent.z * midT;
  let baseY = groundY;
  if (terrain) {
    baseY = sampleTerrain(terrain, midX, -midZ, sideM);
  }
  const topY = baseY + building.height;
  return {
    id: building.id,
    tangentMin: tMin,
    tangentMax: tMax,
    baseY,
    topY,
    floors: floorLinesForBuilding(building, baseY, topY),
  };
}

export function sectionAxis(model: CityModel, pose: SectionKnifePose): SectionAxis {
  const normalV = knifeNormalXZ(pose);
  const normal = { x: normalV.x, z: normalV.z };
  const tangent = { x: -normal.z, z: normal.x };
  return {
    normal,
    tangent,
    originX: normal.x * pose.offsetM,
    originZ: normal.z * pose.offsetM,
    offsetM: pose.offsetM,
    halfWidth: model.sideM * 0.48,
  };
}

export function collectSectionProfiles(model: CityModel, pose: SectionKnifePose): SectionProfile[] {
  const axis = sectionAxis(model, pose);
  const groundY = model.terrain ? model.terrain.min : 0;
  const out: SectionProfile[] = [];
  for (const building of model.buildings) {
    if (building.meshDrawnBy != null) continue;
    const profile = profileFromRing(building.ring, building, axis, groundY, model.terrain, model.sideM);
    if (profile) out.push(profile);
  }
  out.sort((a, b) => a.tangentMin - b.tangentMin);
  return out;
}

export function groundProfileSamples(
  model: CityModel,
  pose: SectionKnifePose,
  steps = 48,
): { tangent: number; y: number }[] {
  const axis = sectionAxis(model, pose);
  const groundY = model.terrain ? model.terrain.min : 0;
  const samples: { tangent: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = -axis.halfWidth + (i / steps) * axis.halfWidth * 2;
    const x = axis.originX + axis.tangent.x * t;
    const z = axis.originZ + axis.tangent.z * t;
    let y = groundY;
    if (model.terrain) {
      y = sampleTerrain(model.terrain, x, -z, model.sideM);
    }
    samples.push({ tangent: t, y });
  }
  return samples;
}

