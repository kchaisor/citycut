import { openRing } from "./geo";
import { MASSING_FLOOR_HEIGHT_M } from "./massingBlock";
import {
  FACADE_BAY_WIDTH_M,
  FACADE_PODIUM_GRID_M,
  FACADE_SILL_ABOVE_FLOOR_M,
  FACADE_STOREY_HEIGHT_M,
  FACADE_WALL_OFFSET_M,
  type FacadeUnitSample,
} from "./facadeSolarTypes";
import { gridPointsInRing } from "./solarPlanShadowSteps";
import { footprintBase } from "./terrain";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

const BUILDING_SURFACE_LIFT_M = 0.05;

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

function bayPointsOnEdge(a: Pt, b: Pt, outward: Pt, baseYM: number, floor: number, buildingId: number, edgeIndex: number): FacadeUnitSample[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 0.35) return [];
  const bayCount = Math.max(1, Math.ceil(length / FACADE_BAY_WIDTH_M));
  const yM = baseYM + floor * MASSING_FLOOR_HEIGHT_M + FACADE_SILL_ABOVE_FLOOR_M;
  const out: FacadeUnitSample[] = [];
  for (let bay = 0; bay < bayCount; bay++) {
    const along = Math.min(length, (bay + 0.5) * FACADE_BAY_WIDTH_M);
    const t = along / length;
    const east = a[0] + dx * t + outward[0] * FACADE_WALL_OFFSET_M;
    const north = a[1] + dy * t + outward[1] * FACADE_WALL_OFFSET_M;
    out.push({
      id: `facade-${buildingId}-f${floor}-e${edgeIndex}-b${bay}`,
      kind: "facade-bay",
      buildingId,
      floor,
      east,
      north,
      yM,
      outwardEast: outward[0],
      outwardNorth: outward[1],
    });
  }
  return out;
}

export function facadeBayUnitsForBuilding(model: CityModel, building: BuildingFeat): FacadeUnitSample[] {
  if (!building.proposedMassing) return [];
  const open = openRing(building.ring);
  if (open.length < 3) return [];
  const closed = [...open, open[0]!];
  const outwardSign = ringSignedArea(building.ring) >= 0 ? 1 : -1;
  const baseYM = footprintBaseY(model, building.ring);
  const floors = Math.max(1, Math.ceil(building.height / FACADE_STOREY_HEIGHT_M));
  const units: FacadeUnitSample[] = [];
  for (let floor = 0; floor < floors; floor++) {
    for (let i = 0; i < closed.length - 1; i++) {
      const outward = edgeOutwardNormal(closed[i]!, closed[i + 1]!, outwardSign);
      units.push(...bayPointsOnEdge(closed[i]!, closed[i + 1]!, outward, baseYM, floor, building.id, i));
    }
  }
  return units;
}

export function facadeBayUnitsForModel(model: CityModel): FacadeUnitSample[] {
  const units: FacadeUnitSample[] = [];
  for (const building of model.buildings) {
    units.push(...facadeBayUnitsForBuilding(model, building));
  }
  return units;
}

export function podiumReceptorUnitsForModel(model: CityModel): FacadeUnitSample[] {
  const units: FacadeUnitSample[] = [];
  for (const building of model.buildings) {
    if (!building.proposedMassing) continue;
    const baseYM = footprintBaseY(model, building.ring) + building.height;
    const points = gridPointsInRing(building.ring, FACADE_PODIUM_GRID_M);
    const cellM2 = FACADE_PODIUM_GRID_M * FACADE_PODIUM_GRID_M;
    if (points.length === 0) continue;
    let index = 0;
    for (const [east, north] of points) {
      units.push({
        id: `podium-${building.id}-${index}`,
        kind: "podium-receptor",
        buildingId: building.id,
        floor: 0,
        east,
        north,
        yM: baseYM + 1.6,
        outwardEast: 0,
        outwardNorth: 1,
      });
      index += 1;
      void cellM2;
    }
  }
  return units;
}
