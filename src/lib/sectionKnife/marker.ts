import type { Pt } from "../../types";
import type { CityModel } from "../../types";
import { siteFrameFromModel } from "../modelFrame";
import { clipLine } from "../siteFrame";
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

export type SectionPlanMarkerClip = {
  east0: number;
  north0: number;
  east1: number;
  north1: number;
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

export function sectionPlanMarkerClip(model: CityModel, geom: SectionPlanMarkerGeometry): SectionPlanMarkerClip {
  const midE = (geom.east0 + geom.east1) * 0.5;
  const midN = (geom.north0 + geom.north1) * 0.5;
  const ext = model.sideM * 2;
  const line: Pt[] = [
    [midE - geom.tangentEast * ext, midN - geom.tangentNorth * ext],
    [midE + geom.tangentEast * ext, midN + geom.tangentNorth * ext],
  ];
  const parts = clipLine(siteFrameFromModel(model), line);
  if (!parts[0] || parts[0].length < 2) {
    return { east0: geom.east0, north0: geom.north0, east1: geom.east1, north1: geom.north1 };
  }
  const part = parts[0];
  const a = part[0]!;
  const b = part[part.length - 1]!;
  return { east0: a[0], north0: a[1], east1: b[0], north1: b[1] };
}

export function sectionKnifeKeepSidePositive(pose: SectionKnifePose, east: number, north: number): boolean {
  const normal = knifeNormalXZ(pose);
  const { x, z } = enToScene(east, north);
  return normal.x * x + normal.z * z - pose.offsetM >= -0.05;
}
