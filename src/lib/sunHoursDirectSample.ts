import { openRing } from "./geo";
import { MASSING_FLOOR_HEIGHT_M } from "./massingBlock";
import { SUN_HOURS_GROUND_CELL_M } from "./sunHoursGround";
import { gridPointsInRing } from "./solarPlanShadowSteps";
import { footprintBase } from "./terrain";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

const BUILDING_SURFACE_LIFT_M = 0.05;
const WALL_OFFSET_M = 0.08;

export type DirectSunHoursSample = {
  id: string;
  kind: "facade-bay" | "roof-cell";
  buildingId: number;
  east: number;
  north: number;
  yM: number;
  outwardEast: number;
  outwardNorth: number;
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

function wallSamplesOnEdge(
  a: Pt,
  b: Pt,
  outward: Pt,
  baseYM: number,
  floor: number,
  buildingId: number,
  edgeIndex: number,
): DirectSunHoursSample[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 0.35) return [];
  const bayCount = Math.max(1, Math.ceil(length / SUN_HOURS_GROUND_CELL_M));
  const bandCount = Math.max(1, Math.ceil(MASSING_FLOOR_HEIGHT_M / SUN_HOURS_GROUND_CELL_M));
  const out: DirectSunHoursSample[] = [];
  for (let bay = 0; bay < bayCount; bay++) {
    const along = Math.min(length, (bay + 0.5) * SUN_HOURS_GROUND_CELL_M);
    const t = along / length;
    for (let band = 0; band < bandCount; band++) {
      const yM = baseYM + floor * MASSING_FLOOR_HEIGHT_M + (band + 0.5) * SUN_HOURS_GROUND_CELL_M;
      out.push({
        id: `direct-${buildingId}-f${floor}-e${edgeIndex}-b${bay}-u${band}`,
        kind: "facade-bay",
        buildingId,
        east: a[0] + dx * t + outward[0] * WALL_OFFSET_M,
        north: a[1] + dy * t + outward[1] * WALL_OFFSET_M,
        yM,
        outwardEast: outward[0],
        outwardNorth: outward[1],
      });
    }
  }
  return out;
}

function samplesForBuilding(model: CityModel, building: BuildingFeat): DirectSunHoursSample[] {
  const open = openRing(building.ring);
  if (open.length < 3) return [];
  const closed = [...open, open[0]!];
  const outwardSign = ringSignedArea(building.ring) >= 0 ? 1 : -1;
  const baseYM = footprintBaseY(model, building.ring);
  const floors = Math.max(1, Math.ceil(building.height / MASSING_FLOOR_HEIGHT_M));
  const units: DirectSunHoursSample[] = [];
  for (let floor = 0; floor < floors; floor++) {
    for (let edge = 0; edge < closed.length - 1; edge++) {
      const outward = edgeOutwardNormal(closed[edge]!, closed[edge + 1]!, outwardSign);
      units.push(...wallSamplesOnEdge(closed[edge]!, closed[edge + 1]!, outward, baseYM, floor, building.id, edge));
    }
  }
  const roofY = baseYM + building.height - 0.04;
  const roofPoints = gridPointsInRing(building.ring, SUN_HOURS_GROUND_CELL_M);
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
    });
  }
  return units;
}

function samplesForBuildingCoarse(model: CityModel, building: BuildingFeat): DirectSunHoursSample[] {
  const open = openRing(building.ring);
  if (open.length < 3) return [];
  const closed = [...open, open[0]!];
  const outwardSign = ringSignedArea(building.ring) >= 0 ? 1 : -1;
  const baseYM = footprintBaseY(model, building.ring);
  const floors = Math.max(1, Math.ceil(building.height / MASSING_FLOOR_HEIGHT_M));
  const units: DirectSunHoursSample[] = [];
  const midFloor = Math.floor(floors / 2);
  for (let edge = 0; edge < closed.length - 1; edge++) {
    const outward = edgeOutwardNormal(closed[edge]!, closed[edge + 1]!, outwardSign);
    units.push(
      ...wallSamplesOnEdge(closed[edge]!, closed[edge + 1]!, outward, baseYM, midFloor, building.id, edge).slice(0, 1),
    );
  }
  const roofY = baseYM + building.height - 0.04;
  const roofPoints = gridPointsInRing(building.ring, SUN_HOURS_GROUND_CELL_M * 2);
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
    });
  }
  return units;
}

export function directSunHoursSamplesForModel(model: CityModel): DirectSunHoursSample[] {
  const coarse = model.buildings.length > 120;
  const units: DirectSunHoursSample[] = [];
  for (const building of model.buildings) {
    units.push(...(coarse ? samplesForBuildingCoarse(model, building) : samplesForBuilding(model, building)));
  }
  return units;
}
