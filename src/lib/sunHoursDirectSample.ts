import { openRing } from "./geo";
import { extrudedFootprintsForBuilding, type ExtrudedFootprint } from "./extrudedBuildingFootprint";
import { ringCentroid } from "./sunHoursRoofFootprint";
import { receivesSunHours } from "./sunHoursBuildings";
import {
  FAST_SUN_HOURS_PARAMS,
  SUN_HOURS_MAX_WALL_CELL_M,
  sunHoursStartWallCellM,
  type SunHoursSampleParams,
} from "./sunHoursQuality";
import { footprintBase } from "./terrain";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

const BUILDING_SURFACE_LIFT_M = 0.05;
const WALL_OFFSET_M = 0.08;

export function gridPointsInRing(ring: Ring, stepM: number): [number, number][] {
  if (ring.length < 3 || !(stepM > 0)) return [];
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const [east, north] of ring) {
    minE = Math.min(minE, east);
    maxE = Math.max(maxE, east);
    minN = Math.min(minN, north);
    maxN = Math.max(maxN, north);
  }
  const points: [number, number][] = [];
  for (let east = minE + stepM / 2; east < maxE; east += stepM) {
    for (let north = minN + stepM / 2; north < maxN; north += stepM) {
      if (pointInPolygon([east, north], ring, [])) points.push([east, north]);
    }
  }
  return points;
}

export type DirectSunHoursSample = {
  id: string;
  kind: "facade-bay" | "roof-cell";
  buildingId: number;
  east: number;
  north: number;
  yM: number;
  outwardEast: number;
  outwardNorth: number;
  spanM: number;
};

function ringSignedArea(ring: Ring): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[i + 1]!;
    area += x0 * y1 - x1 * y0;
  }
  return area / 2;
}

function edgeOutwardNormal(a: Pt, b: Pt, outwardSign: number): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [(outwardSign * dy) / len, (outwardSign * -dx) / len];
}

function footprintBaseY(model: CityModel, ring: Ring): number {
  return (model.terrain ? footprintBase(model.terrain, ring, model.sideM) : 0) + BUILDING_SURFACE_LIFT_M;
}

function underTallerPart(point: Pt, part: ExtrudedFootprint, footprints: ExtrudedFootprint[]): boolean {
  const top = (part.base ?? 0) + part.height;
  return footprints.some(
    (other) => other !== part && (other.base ?? 0) + other.height > top && pointInPolygon(point, other.ring, other.holes),
  );
}

function roofSamplesForBuilding(model: CityModel, building: BuildingFeat, cellM: number): DirectSunHoursSample[] {
  const footprints = extrudedFootprintsForBuilding(building);
  if (footprints.length === 0) return [];
  const baseYM = footprintBaseY(model, building.ring);
  const units: DirectSunHoursSample[] = [];
  let roofIndex = 0;
  for (const part of footprints) {
    const roofY = baseYM + (part.base ?? 0) + part.height - 0.04;
    for (const [east, north] of gridPointsInRing(part.ring, cellM)) {
      if (footprints.length > 1 && underTallerPart([east, north], part, footprints)) continue;
      units.push({
        id: `direct-roof-${building.id}-${roofIndex++}`,
        kind: "roof-cell",
        buildingId: building.id,
        east,
        north,
        yM: roofY,
        outwardEast: 0,
        outwardNorth: 0,
        spanM: cellM,
      });
    }
  }
  if (units.length === 0) {
    const tallest = footprints.reduce((a, b) => ((b.base ?? 0) + b.height > (a.base ?? 0) + a.height ? b : a));
    const [east, north] = ringCentroid(tallest.ring);
    units.push({
      id: `direct-roof-${building.id}-centroid`,
      kind: "roof-cell",
      buildingId: building.id,
      east,
      north,
      yM: baseYM + (tallest.base ?? 0) + tallest.height - 0.04,
      outwardEast: 0,
      outwardNorth: 0,
      spanM: cellM,
    });
  }
  return units;
}

function wallSamplesForPart(
  building: BuildingFeat,
  part: ExtrudedFootprint,
  partIndex: number,
  baseYM: number,
  cellM: number,
): DirectSunHoursSample[] {
  const open = openRing(part.ring);
  if (open.length < 3) return [];
  const closed = [...open, open[0]!];
  const outwardSign = ringSignedArea(part.ring) >= 0 ? 1 : -1;
  const partBaseYM = baseYM + (part.base ?? 0);
  const heightM = Math.max(0.5, part.height);
  const units: DirectSunHoursSample[] = [];
  for (let edge = 0; edge < closed.length - 1; edge++) {
    const a = closed[edge]!;
    const b = closed[edge + 1]!;
    const outward = edgeOutwardNormal(a, b, outwardSign);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 0.35) continue;
    const bayCount = Math.max(1, Math.ceil(length / cellM));
    const bandCount = Math.max(1, Math.ceil(heightM / cellM));
    for (let bay = 0; bay < bayCount; bay++) {
      const along = Math.min(length, (bay + 0.5) * cellM);
      const t = along / length;
      for (let band = 0; band < bandCount; band++) {
        const yM = Math.min(partBaseYM + (band + 0.5) * cellM, partBaseYM + heightM - 0.02);
        units.push({
          id: `direct-wall-${building.id}-p${partIndex}-e${edge}-b${bay}-u${band}`,
          kind: "facade-bay",
          buildingId: building.id,
          east: a[0] + dx * t + outward[0] * WALL_OFFSET_M,
          north: a[1] + dy * t + outward[1] * WALL_OFFSET_M,
          yM,
          outwardEast: outward[0],
          outwardNorth: outward[1],
          spanM: cellM,
        });
      }
    }
  }
  return units;
}

function wallSamplesForBuilding(model: CityModel, building: BuildingFeat, cellM: number): DirectSunHoursSample[] {
  const footprints = extrudedFootprintsForBuilding(building);
  if (footprints.length === 0) return [];
  const baseYM = footprintBaseY(model, building.ring);
  return footprints.flatMap((part, partIndex) => wallSamplesForPart(building, part, partIndex, baseYM, cellM));
}

function wallSamplesAll(model: CityModel, wallCellM: number): DirectSunHoursSample[] {
  const units: DirectSunHoursSample[] = [];
  for (const building of model.buildings.filter(receivesSunHours)) {
    units.push(...wallSamplesForBuilding(model, building, wallCellM));
  }
  return units;
}

function roofSamplesAll(model: CityModel, cellM: number): DirectSunHoursSample[] {
  const units: DirectSunHoursSample[] = [];
  for (const building of model.buildings.filter(receivesSunHours)) {
    units.push(...roofSamplesForBuilding(model, building, cellM));
  }
  return units;
}

export type DirectSunHoursSampleSet = {
  samples: DirectSunHoursSample[];
  wallCellM: number;
};

export function directSunHoursSampleSet(
  model: CityModel,
  params: SunHoursSampleParams = FAST_SUN_HOURS_PARAMS,
): DirectSunHoursSampleSet {
  const roofs = roofSamplesAll(model, params.cellM);
  let wallCellM = sunHoursStartWallCellM(params, model.buildings.length);
  let walls = wallSamplesAll(model, wallCellM);
  while (walls.length > params.wallSampleCap && wallCellM < SUN_HOURS_MAX_WALL_CELL_M) {
    wallCellM = Math.min(SUN_HOURS_MAX_WALL_CELL_M, wallCellM * 2);
    walls = wallSamplesAll(model, wallCellM);
  }
  return { samples: [...roofs, ...walls], wallCellM };
}

export function directSunHoursSamplesForModel(
  model: CityModel,
  params: SunHoursSampleParams = FAST_SUN_HOURS_PARAMS,
): DirectSunHoursSample[] {
  return directSunHoursSampleSet(model, params).samples;
}
