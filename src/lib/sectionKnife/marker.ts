import type { CityModel } from "../../types";
import { knifeNormalXZ, type SectionKnifePose } from "./plane";
import { sectionAxis } from "./profiles";

export type SectionPlanMarkerGeometry = {
  east0: number;
  north0: number;
  east1: number;
  north1: number;
  viewEast: number;
  viewNorth: number;
  tangentEast: number;
  tangentNorth: number;
};

function sceneToEn(x: number, z: number): { east: number; north: number } {
  return { east: x, north: -z };
}

function enToScene(east: number, north: number): { x: number; z: number } {
  return { x: east, z: -north };
}

export function sectionPlanMarkerGeometry(model: CityModel, pose: SectionKnifePose): SectionPlanMarkerGeometry {
  const axis = sectionAxis(model, pose);
  const t0 = -axis.halfWidth;
  const t1 = axis.halfWidth;
  const x0 = axis.originX + axis.tangent.x * t0;
  const z0 = axis.originZ + axis.tangent.z * t0;
  const x1 = axis.originX + axis.tangent.x * t1;
  const z1 = axis.originZ + axis.tangent.z * t1;
  const p0 = sceneToEn(x0, z0);
  const p1 = sceneToEn(x1, z1);
  const view = { east: axis.normal.x, north: -axis.normal.z };
  const len = Math.hypot(view.east, view.north) || 1;
  const tangent = sceneToEn(axis.tangent.x, axis.tangent.z);
  const tlen = Math.hypot(tangent.east, tangent.north) || 1;
  return {
    east0: p0.east,
    north0: p0.north,
    east1: p1.east,
    north1: p1.north,
    viewEast: view.east / len,
    viewNorth: view.north / len,
    tangentEast: tangent.east / tlen,
    tangentNorth: tangent.north / tlen,
  };
}

export function sectionKnifeKeepSidePositive(pose: SectionKnifePose, east: number, north: number): boolean {
  const normal = knifeNormalXZ(pose);
  const { x, z } = enToScene(east, north);
  return normal.x * x + normal.z * z - pose.offsetM >= -0.05;
}
