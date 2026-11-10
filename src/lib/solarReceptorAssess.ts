import type { MultiPolygon, Pair } from "polygon-clipping";
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
  ringAxisMinDimensionM,
  type B43ProposalStatus,
} from "./solarAccessB43";
import { buildRescodeStepShadows, clipModelForRings, gridPointsInRing } from "./solarPlanShadowSteps";
import type { CityModel, Ring } from "../types";

export const SOLAR_RECEPTOR_GRID_M = 2;

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

function assessOneReceptor(
  receptor: SolarReceptorArea,
  stepShadows: ReturnType<typeof buildRescodeStepShadows>,
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
  const clipped = clipModelForRings(model, [receptor.ring]);
  const stepShadows = buildRescodeStepShadows(clipped, year, [receptor.ring]);
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
  const clipped = clipModelForRings(model, rings);
  const stepShadows = buildRescodeStepShadows(clipped, year, rings);
  return receptors.map((receptor) => assessOneReceptor(receptor, stepShadows, gridM));
}
