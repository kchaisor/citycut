import { interiorPoint } from "../useCascade";
import { sampleTerrain } from "../terrain";
import type { CityModel } from "../../types";
import { knifeNormalXZ, type SectionKnifePose, projectOntoSectionAxis } from "./plane";

export type ElevationSegment = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  kind: "building" | "terrain";
};

export type SectionElevationModel = {
  widthM: number;
  minYM: number;
  maxYM: number;
  segments: ElevationSegment[];
  groundProfile: { x: number; y: number }[];
};

function sceneZFromNorth(north: number): number {
  return -north;
}

export function buildSectionElevation(model: CityModel, pose: SectionKnifePose, sliceHalfWidthM: number): SectionElevationModel {
  const normal = knifeNormalXZ(pose);
  const tangentX = -normal.z;
  const tangentZ = normal.x;
  const originX = normal.x * pose.offsetM;
  const originZ = normal.z * pose.offsetM;
  const groundY = model.terrain ? model.terrain.min : 0;
  let minYM = groundY;
  let maxYM = groundY + 20;
  const segments: ElevationSegment[] = [];
  const sliceEps = 2.5;

  for (const building of model.buildings) {
    if (building.meshDrawnBy != null) continue;
    const pt = interiorPoint(building.ring);
    const z = sceneZFromNorth(pt[1]);
    const dist = (pt[0] - originX) * normal.x + (z - originZ) * normal.z;
    if (Math.abs(dist) > sliceEps) continue;
    const base = groundY;
    const top = base + building.height;
    minYM = Math.min(minYM, base);
    maxYM = Math.max(maxYM, top);
    const x = projectOntoSectionAxis(pose, pt[0], z);
    const halfW = Math.max(4, Math.sqrt(Math.abs(building.ring[0][0] - pt[0]) ** 2 + (building.ring[0][1] - pt[1]) ** 2) * 0.35);
    segments.push({
      x0: x - halfW,
      x1: x + halfW,
      y0: base,
      y1: top,
      kind: "building",
    });
  }

  const groundProfile: { x: number; y: number }[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 - 1;
    const east = originX + tangentX * sliceHalfWidthM * t;
    const north = originZ + tangentZ * sliceHalfWidthM * t;
    const z = sceneZFromNorth(north);
    const x = projectOntoSectionAxis(pose, east, z);
    let y = groundY;
    if (model.terrain) {
      y = sampleTerrain(model.terrain, east, -z, model.sideM);
    }
    minYM = Math.min(minYM, y);
    maxYM = Math.max(maxYM, y + 25);
    groundProfile.push({ x, y });
  }

  return {
    widthM: sliceHalfWidthM * 2,
    minYM,
    maxYM: maxYM + 5,
    segments,
    groundProfile,
  };
}
