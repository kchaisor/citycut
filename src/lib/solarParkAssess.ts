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
import type { CityModel } from "../types";

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
  pass: boolean;
  statusLabel: string;
  statusTone: "pass" | "fail";
  toleranceM2: number;
};

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

  for (const stepShadow of stepShadows) {
    let added = 0;
    for (const point of points) {
      const inProposed = pointInLocalMulti(point, stepShadow.proposed);
      const inExisting = pointInLocalMulti(point, stepShadow.existing);
      if (inProposed && !inExisting) added += cellM2;
    }
    stepAddedM2.push({ hour: stepShadow.hour, minute: stepShadow.minute, addedM2: added });
  }

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
