import type { MultiPolygon, Pair } from "polygon-clipping";
import {
  isProposedMassingBuilding,
  planShadowRings,
  planShadowSplitRings,
  type PlanShadowInput,
} from "./buildingShadows";
import { pointInLocalMulti } from "./massingParcelBoundary";
import {
  RESCODE_B43_STEP_MINUTES,
  b43MinDimensionSatisfied,
  b43RequiredSunlitAreaM2,
  b43ProposalStatus,
  b43StatusLabel,
  b43StatusTone,
  meetsSunHourThreshold,
  receptorAreaM2,
  rescodeB43AssessmentSteps,
  ringAxisMinDimensionM,
  type B43ProposalStatus,
} from "./solarAccessB43";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

export const SOLAR_RECEPTOR_GRID_M = 2;
const SHADOW_CONTEXT_MARGIN_M = 160;

export type SolarReceptorArea = {
  id: string;
  ring: Ring;
  label?: string;
};

export type SolarReceptorAssessResult = {
  id: string;
  areaM2: number;
  requiredSunlitM2: number;
  existingSunlitM2: number;
  proposedSunlitM2: number;
  addedShadowM2H: number;
  existingPass: boolean;
  proposedPass: boolean;
  status: B43ProposalStatus;
  statusLabel: string;
  statusTone: "pass" | "fail" | "warn";
  minDimensionOk: boolean;
};

function closePairRing(ring: Ring): Pair[] {
  const out: Pair[] = ring.map(([east, north]) => [east, north] as Pair);
  if (out.length < 3) return out;
  const first = out[0]!;
  const last = out[out.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  return out;
}

export function planShadowRingsToMulti(rings: Ring[][]): MultiPolygon {
  const multi: MultiPolygon = [];
  for (const polygon of rings) {
    if (!polygon[0] || polygon[0].length < 3) continue;
    const outer = closePairRing(polygon[0]);
    const holes = polygon.slice(1).map((hole) => closePairRing(hole));
    multi.push([outer, ...holes]);
  }
  return multi;
}

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

function clippedModel(model: CityModel, rings: readonly Ring[]): CityModel {
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
  if (buildings.length === model.buildings.length) return model;
  return { ...model, buildings };
}

function gridPointsInRing(ring: Ring, stepM: number): Pt[] {
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
  const points: Pt[] = [];
  for (let east = minE + stepM / 2; east < maxE; east += stepM) {
    for (let north = minN + stepM / 2; north < maxN; north += stepM) {
      if (pointInPolygon([east, north], ring, [])) points.push([east, north]);
    }
  }
  return points;
}

type StepShadow = { existing: MultiPolygon; proposed: MultiPolygon };

function buildStepShadows(model: CityModel, year: number): StepShadow[] {
  const context = { ...model, buildings: model.buildings.filter((building) => !isProposedMassingBuilding(building)) };
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
      proposed: planShadowRingsToMulti(planShadowRings(model, when, true)),
    };
  });
}

function assessOneReceptor(
  receptor: SolarReceptorArea,
  stepShadows: StepShadow[],
  gridM: number,
): SolarReceptorAssessResult {
  const ring = receptor.ring;
  const areaM2 = receptorAreaM2(ring);
  const requiredSunlitM2 = b43RequiredSunlitAreaM2(areaM2);
  const minDim = ringAxisMinDimensionM(ring);
  const minDimensionOk = b43MinDimensionSatisfied(areaM2, minDim);
  const points = gridPointsInRing(ring, gridM);
  const cellM2 = gridM * gridM;
  const existingLitSteps = new Uint16Array(points.length);
  const proposedLitSteps = new Uint16Array(points.length);

  for (const stepShadow of stepShadows) {
    for (let index = 0; index < points.length; index++) {
      const point = points[index]!;
      if (!pointInLocalMulti(point, stepShadow.existing)) existingLitSteps[index]! += 1;
      if (!pointInLocalMulti(point, stepShadow.proposed)) proposedLitSteps[index]! += 1;
    }
  }

  let existingSunlitM2 = 0;
  let proposedSunlitM2 = 0;
  let addedShadowM2H = 0;
  const stepHours = RESCODE_B43_STEP_MINUTES / 60;

  for (let index = 0; index < points.length; index++) {
    const existingSteps = existingLitSteps[index]!;
    const proposedSteps = proposedLitSteps[index]!;
    if (meetsSunHourThreshold(existingSteps)) existingSunlitM2 += cellM2;
    if (meetsSunHourThreshold(proposedSteps)) proposedSunlitM2 += cellM2;
    if (proposedSteps < existingSteps) addedShadowM2H += (existingSteps - proposedSteps) * stepHours * cellM2;
  }

  const existingPass = minDimensionOk && existingSunlitM2 + 1e-6 >= requiredSunlitM2;
  const proposedPass = minDimensionOk && proposedSunlitM2 + 1e-6 >= requiredSunlitM2;
  const status = b43ProposalStatus(existingSunlitM2, proposedSunlitM2, areaM2, addedShadowM2H);

  return {
    id: receptor.id,
    areaM2,
    requiredSunlitM2,
    existingSunlitM2,
    proposedSunlitM2,
    addedShadowM2H,
    existingPass,
    proposedPass,
    status,
    statusLabel: b43StatusLabel(status),
    statusTone: b43StatusTone(status),
    minDimensionOk,
  };
}

export function assessSolarReceptor(
  model: CityModel,
  receptor: SolarReceptorArea,
  year: number,
  gridM = SOLAR_RECEPTOR_GRID_M,
): SolarReceptorAssessResult {
  const clipped = clippedModel(model, [receptor.ring]);
  const stepShadows = buildStepShadows(clipped, year);
  return assessOneReceptor(receptor, stepShadows, gridM);
}

export function assessSolarReceptors(
  model: CityModel,
  receptors: readonly SolarReceptorArea[],
  year: number,
  gridM = SOLAR_RECEPTOR_GRID_M,
): SolarReceptorAssessResult[] {
  if (receptors.length === 0) return [];
  const rings = receptors.map((receptor) => receptor.ring);
  const clipped = clippedModel(model, rings);
  const stepShadows = buildStepShadows(clipped, year);
  return receptors.map((receptor) => assessOneReceptor(receptor, stepShadows, gridM));
}
