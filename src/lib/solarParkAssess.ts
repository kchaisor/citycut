import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair } from "polygon-clipping";
import { shadowRingsFromMulti } from "./buildingShadows";
import { pointInLocalMulti } from "./massingParcelBoundary";
import {
  PARK_NO_ADDITIONAL_TOLERANCE_M2,
  parkRuleForReceptor,
  solarRuleDefinition,
  type ParkSolarRuleId,
  type SolarRuleDefinition,
} from "./solarRuleRegistry";
import { receptorAreaM2 } from "./solarAccessB43";
import type { SolarReceptorArea } from "./solarReceptorAssess";
import { buildRuleStepShadows, gridPointsInRing } from "./solarPlanShadowSteps";
import type { CityModel, Pt, Ring } from "../types";

export type SolarParkStepAdded = {
  hour: number;
  minute: number;
  addedM2: number;
};

export type SolarParkAssessResult = {
  assessKind: "park";
  id: string;
  ruleId: ParkSolarRuleId;
  ruleLabel: string;
  statusNote: string;
  areaM2: number;
  stepAddedM2: SolarParkStepAdded[];
  totalAddedM2: number;
  maxAddedM2: number;
  addedShadowRings: Ring[][];
  pass: boolean;
  statusLabel: string;
  statusTone: "pass" | "fail";
  toleranceM2: number;
};

export function representativeParkStep(steps: readonly SolarParkStepAdded[]): number {
  let bestIndex = -1;
  for (let index = 0; index < steps.length; index++) {
    if (steps[index]!.addedM2 < 0.01) continue;
    if (bestIndex < 0 || steps[index]!.addedM2 > steps[bestIndex]!.addedM2) bestIndex = index;
  }
  return bestIndex;
}

function closedPairs(ring: Ring): Pair[] {
  const pairs = ring.map(([east, north]) => [east, north] as Pair);
  const first = pairs[0]!;
  const last = pairs[pairs.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) pairs.push([first[0], first[1]]);
  return pairs;
}

function addedCellRings(addedPoints: readonly Pt[], gridM: number): Ring[][] {
  const half = gridM / 2;
  return addedPoints.map(([east, north]) => [
    [
      [east - half, north - half],
      [east + half, north - half],
      [east + half, north + half],
      [east - half, north + half],
      [east - half, north - half],
    ],
  ]);
}

export function parkAddedShadowRings(
  parkRing: Ring,
  stepShadow: { existing: MultiPolygon; proposed: MultiPolygon },
  addedPoints: readonly Pt[],
  gridM: number,
): Ring[][] {
  if (addedPoints.length === 0) return [];
  try {
    const added = polygonClipping.difference(stepShadow.proposed, stepShadow.existing);
    const clipped = polygonClipping.intersection(added, [[closedPairs(parkRing)]]);
    const rings = shadowRingsFromMulti(clipped);
    if (rings.length > 0) return rings;
  } catch {
    return addedCellRings(addedPoints, gridM);
  }
  return addedCellRings(addedPoints, gridM);
}

export function parkNoAdditionalPass(maxAddedM2: number, toleranceM2 = PARK_NO_ADDITIONAL_TOLERANCE_M2): boolean {
  return maxAddedM2 <= toleranceM2 + 1e-9;
}

export function parkStatusLabel(pass: boolean, maxAddedM2: number, toleranceM2: number): string {
  if (pass) {
    return maxAddedM2 < 0.01
      ? "Passes — no added shadow"
      : `Passes — max added ${maxAddedM2.toFixed(2)} m² (≤ ${toleranceM2} m²)`;
  }
  return `Fails — max added ${maxAddedM2.toFixed(1)} m² (limit ${toleranceM2} m²)`;
}

export function assessParkWithRule(
  receptor: SolarReceptorArea,
  stepShadows: ReturnType<typeof buildRuleStepShadows>,
  rule: SolarRuleDefinition,
  gridM: number,
): SolarParkAssessResult {
  const ring = receptor.ring;
  const areaM2 = receptorAreaM2(ring);
  const points = gridPointsInRing(ring, gridM);
  const cellM2 = gridM * gridM;
  const stepAddedM2: SolarParkStepAdded[] = [];
  const stepAddedPoints: Pt[][] = [];

  for (const stepShadow of stepShadows) {
    const addedPoints = points.filter(
      (point) => pointInLocalMulti(point, stepShadow.proposed) && !pointInLocalMulti(point, stepShadow.existing),
    );
    stepAddedPoints.push(addedPoints);
    stepAddedM2.push({ hour: stepShadow.hour, minute: stepShadow.minute, addedM2: addedPoints.length * cellM2 });
  }
  const worstStep = representativeParkStep(stepAddedM2);
  const addedShadowRings =
    worstStep < 0 ? [] : parkAddedShadowRings(ring, stepShadows[worstStep]!, stepAddedPoints[worstStep]!, gridM);

  const totalAddedM2 = stepAddedM2.reduce((sum, row) => sum + row.addedM2, 0);
  const maxAddedM2 = stepAddedM2.reduce((max, row) => Math.max(max, row.addedM2), 0);
  const toleranceM2 = PARK_NO_ADDITIONAL_TOLERANCE_M2;
  const pass = parkNoAdditionalPass(maxAddedM2, toleranceM2);

  return {
    assessKind: "park",
    id: receptor.id,
    ruleId: rule.id as ParkSolarRuleId,
    ruleLabel: rule.label,
    statusNote: rule.statusNote,
    areaM2,
    stepAddedM2,
    totalAddedM2,
    maxAddedM2,
    addedShadowRings,
    pass,
    statusLabel: parkStatusLabel(pass, maxAddedM2, toleranceM2),
    statusTone: pass ? "pass" : "fail",
    toleranceM2,
  };
}

export function assessSolarParkReceptor(
  model: CityModel,
  receptor: SolarReceptorArea,
  year: number,
  gridM: number,
  ruleId?: ParkSolarRuleId,
): SolarParkAssessResult | null {
  const rule =
    parkRuleForReceptor(receptor) ??
    (ruleId ? solarRuleDefinition(ruleId) : null);
  if (!rule || rule.kind !== "noAdditional") return null;
  const stepShadows = buildRuleStepShadows(model, year, rule, [receptor.ring]);
  return assessParkWithRule(receptor, stepShadows, rule, gridM);
}
