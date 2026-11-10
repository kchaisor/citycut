import type { MultiPolygon } from "polygon-clipping";
import {
  isProposedMassingBuilding,
  planShadowRings,
  planShadowSplitRings,
  type PlanShadowInput,
} from "./buildingShadows";
import { pointInPolygon } from "./useCascade";
import { rescodeB43AssessmentSteps } from "./solarAccessB43";
import { planShadowRingsToMulti } from "./solarReceptorAssess";
import type { BuildingFeat, CityModel, Ring } from "../types";

export type StepShadow = { existing: MultiPolygon; proposed: MultiPolygon };

const SHADOW_CONTEXT_MARGIN_M = 160;

function ringBounds(ring: Ring, marginM: number) {
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
  return { minE: minE - marginM, maxE: maxE + marginM, minN: minN - marginM, maxN: maxN + marginM };
}

function buildingInBounds(building: BuildingFeat, bounds: ReturnType<typeof ringBounds>): boolean {
  for (const [east, north] of building.ring) {
    if (east >= bounds.minE && east <= bounds.maxE && north >= bounds.minN && north <= bounds.maxN) return true;
  }
  return false;
}

export function clipModelForRings(model: CityModel, rings: readonly Ring[]): CityModel {
  if (rings.length === 0) return model;
  const bounds = rings.reduce(
    (acc, ring) => {
      const next = ringBounds(ring, SHADOW_CONTEXT_MARGIN_M);
      return {
        minE: Math.min(acc.minE, next.minE),
        maxE: Math.max(acc.maxE, next.maxE),
        minN: Math.min(acc.minN, next.minN),
        maxN: Math.max(acc.maxN, next.maxN),
      };
    },
    { minE: Infinity, maxE: -Infinity, minN: Infinity, maxN: -Infinity },
  );
  const buildings = model.buildings.filter((building) => buildingInBounds(building, bounds));
  return buildings.length === model.buildings.length ? model : { ...model, buildings };
}

export function buildRescodeStepShadows(model: CityModel, year: number, clipRings: readonly Ring[] = []): StepShadow[] {
  const contextBuildings = model.buildings.filter((building) => !isProposedMassingBuilding(building));
  const context = { ...model, buildings: contextBuildings };
  const clipped = clipRings.length > 0 ? clipModelForRings(model, clipRings) : model;
  const steps = rescodeB43AssessmentSteps(model.center.lat, model.center.lon, year);
  const dateBase: Omit<PlanShadowInput, "hour" | "minute"> = {
    lat: model.center.lat,
    lon: model.center.lon,
    year,
    month: 9,
    day: 22,
  };
  return steps.map((step) => {
    const when: PlanShadowInput = { ...dateBase, hour: step.hour, minute: step.minute };
    return {
      existing: planShadowRingsToMulti(planShadowSplitRings(context, when, true).existing),
      proposed: planShadowRingsToMulti(planShadowRings(clipped, when, true)),
    };
  });
}

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
