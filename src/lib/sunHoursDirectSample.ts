import { openRing } from "./geo";
import { SUN_HOURS_GROUND_CELL_M } from "./sunHoursGround";
import { gridPointsInRing } from "./solarPlanShadowSteps";
import { footprintBase } from "./terrain";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

const BUILDING_SURFACE_LIFT_M = 0.05;
const WALL_OFFSET_M = 0.08;
const DIRECT_SUN_HOURS_MAX_WALL_SAMPLES = 48000;

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

function roofSamplesForBuilding(model: CityModel, building: BuildingFeat): DirectSunHoursSample[] {
  const open = openRing(building.ring);
  if (open.length < 3) return [];
  const baseYM = footprintBaseY(model, building.ring);
  const roofY = baseYM + building.height - 0.04;
  const cellM = SUN_HOURS_GROUND_CELL_M;
  const roofPoints = gridPointsInRing(building.ring, cellM);
  const units: DirectSunHoursSample[] = [];
  let roofIndex = 0;
  for (const [east, north] of roofPoints) {
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
  return units;
}

function wallSamplesForBuilding(model: CityModel, building: BuildingFeat, cellM: number): DirectSunHoursSample[] {
  const open = openRing(building.ring);
  if (open.length < 3) return [];
  const closed = [...open, open[0]!];
  const outwardSign = ringSignedArea(building.ring) >= 0 ? 1 : -1;
  const baseYM = footprintBaseY(model, building.ring);
  const heightM = Math.max(0.5, building.height);
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
        const yM = Math.min(baseYM + (band + 0.5) * cellM, baseYM + heightM - 0.02);
        units.push({
          id: `direct-wall-${building.id}-e${edge}-b${bay}-u${band}`,
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

function wallSamplesAll(model: CityModel, wallCellM: number): DirectSunHoursSample[] {
  const units: DirectSunHoursSample[] = [];
  for (const building of model.buildings) {
    units.push(...wallSamplesForBuilding(model, building, wallCellM));
  }
  return units;
}

function roofSamplesAll(model: CityModel): DirectSunHoursSample[] {
  const units: DirectSunHoursSample[] = [];
  for (const building of model.buildings) {
    units.push(...roofSamplesForBuilding(model, building));
  }
  return units;
}

export function directSunHoursSamplesForModel(model: CityModel): DirectSunHoursSample[] {
  const roofs = roofSamplesAll(model);
  let wallCellM = model.buildings.length > 120 ? 6 : SUN_HOURS_GROUND_CELL_M;
  let walls = wallSamplesAll(model, wallCellM);
  while (walls.length > DIRECT_SUN_HOURS_MAX_WALL_SAMPLES && wallCellM < SUN_HOURS_GROUND_CELL_M * 4) {
    wallCellM *= 2;
    walls = wallSamplesAll(model, wallCellM);
  }
  return [...roofs, ...walls];
}
