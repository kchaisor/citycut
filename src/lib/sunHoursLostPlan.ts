import { isProposedMassingBuilding, type PlanShadowTreeMode } from "./buildingShadows";
import { pointInLocalMulti } from "./massingParcelBoundary";
import { pointInPolygon } from "./useCascade";
import { RESCODE_B43_STEP_MINUTES } from "./solarAccessB43";
import { buildRescodeStepShadows } from "./solarPlanShadowSteps";
import { sunHoursLostFromStepCounts } from "./sunHoursLost";
import type { CityModel, Pt, Ring } from "../types";

export const SUN_HOURS_LOST_FOCUS_MARGIN_M = 100;

export type SunHoursLostGrid = {
  cellM: number;
  originEast: number;
  originNorth: number;
  cols: number;
  rows: number;
  lossHours: Float32Array;
  maxLoss: number;
};

function proposedBounds(model: CityModel, marginM: number) {
  const proposed = model.buildings.filter(isProposedMassingBuilding);
  if (proposed.length === 0) return null;
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const building of proposed) {
    for (const [east, north] of building.ring) {
      minE = Math.min(minE, east);
      maxE = Math.max(maxE, east);
      minN = Math.min(minN, north);
      maxN = Math.max(maxN, north);
    }
  }
  return {
    minE: minE - marginM,
    maxE: maxE + marginM,
    minN: minN - marginM,
    maxN: maxN + marginM,
  };
}

function clipModelToBounds(model: CityModel, bounds: ReturnType<typeof proposedBounds>): CityModel {
  if (!bounds) return model;
  const buildings = model.buildings.filter((building) =>
    building.ring.some(
      ([east, north]) =>
        east >= bounds.minE && east <= bounds.maxE && north >= bounds.minN && north <= bounds.maxN,
    ),
  );
  return buildings.length === model.buildings.length ? model : { ...model, buildings };
}

function lossCellCenterInsideBuilding(model: CityModel, east: number, north: number): boolean {
  const point: Pt = [east, north];
  for (const building of model.buildings) {
    if (pointInPolygon(point, building.ring, building.holes ?? [])) return true;
  }
  return false;
}

export function positiveLossCellsInsideFootprints(model: CityModel, grid: SunHoursLostGrid, minHours = 0.01): Pt[] {
  const inside: Pt[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const hours = grid.lossHours[row * grid.cols + col]!;
      if (hours < minHours) continue;
      const east = grid.originEast + (col + 0.5) * grid.cellM;
      const north = grid.originNorth + (row + 0.5) * grid.cellM;
      if (lossCellCenterInsideBuilding(model, east, north)) inside.push([east, north]);
    }
  }
  return inside;
}

function focusRing(bounds: NonNullable<ReturnType<typeof proposedBounds>>): Ring {
  return [
    [bounds.minE, bounds.minN],
    [bounds.maxE, bounds.minN],
    [bounds.maxE, bounds.maxN],
    [bounds.minE, bounds.maxN],
    [bounds.minE, bounds.minN],
  ];
}

export function computeSunHoursLostGrid(
  model: CityModel,
  year: number,
  cellM: number,
  treeMode: PlanShadowTreeMode = "off",
): SunHoursLostGrid | null {
  const bounds = proposedBounds(model, SUN_HOURS_LOST_FOCUS_MARGIN_M);
  if (!bounds) return null;
  const clipped = clipModelToBounds(model, bounds);
  const stepShadows = buildRescodeStepShadows(clipped, year, [focusRing(bounds)], treeMode);
  const cols = Math.max(1, Math.ceil((bounds.maxE - bounds.minE) / cellM));
  const rows = Math.max(1, Math.ceil((bounds.maxN - bounds.minN) / cellM));
  const originEast = bounds.minE;
  const originNorth = bounds.minN;
  const existingLit = new Uint16Array(cols * rows);
  const proposedLit = new Uint16Array(cols * rows);

  for (const stepShadow of stepShadows) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const east = originEast + (col + 0.5) * cellM;
        const north = originNorth + (row + 0.5) * cellM;
        if (east < bounds.minE || east > bounds.maxE || north < bounds.minN || north > bounds.maxN) continue;
        const point: Pt = [east, north];
        const index = row * cols + col;
        if (!pointInLocalMulti(point, stepShadow.existing)) existingLit[index]! += 1;
        if (!pointInLocalMulti(point, stepShadow.proposed)) proposedLit[index]! += 1;
      }
    }
  }

  const lossHours = new Float32Array(cols * rows);
  let maxLoss = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const east = originEast + (col + 0.5) * cellM;
      const north = originNorth + (row + 0.5) * cellM;
      if (lossCellCenterInsideBuilding(clipped, east, north)) {
        lossHours[index] = 0;
        continue;
      }
      const loss = sunHoursLostFromStepCounts(existingLit[index]!, proposedLit[index]!, RESCODE_B43_STEP_MINUTES);
      lossHours[index] = loss;
      maxLoss = Math.max(maxLoss, loss);
    }
  }

  return { cellM, originEast, originNorth, cols, rows, lossHours, maxLoss };
}

export function countPositiveLossCells(grid: SunHoursLostGrid, minHours = 0.01): number {
  let count = 0;
  for (let i = 0; i < grid.lossHours.length; i++) if (grid.lossHours[i]! >= minHours) count += 1;
  return count;
}
