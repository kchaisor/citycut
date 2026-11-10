import type { MultiPolygon } from "polygon-clipping";
import * as polygonClipping from "polygon-clipping";
import { planShadowSplitRings, shadowRingsFromMulti, type PlanShadowInput } from "./buildingShadows";
import { planShadowRingsToMulti } from "./solarReceptorAssess";
import { solarRuleDefinition, type ParkSolarRuleId } from "./solarRuleRegistry";
import type { SolarParkAssessResult, SolarParkStepAdded } from "./solarParkAssess";
import type { CityModel, Ring } from "../types";

export function representativeParkStep(steps: readonly SolarParkStepAdded[]): { hour: number; minute: number } | null {
  if (steps.length === 0) return null;
  let best = steps[0]!;
  for (const step of steps) {
    if (step.addedM2 > best.addedM2) best = step;
  }
  if (best.addedM2 < 0.01) return null;
  return { hour: best.hour, minute: best.minute };
}

export function parkAddedShadowClipRings(
  model: CityModel,
  parkRing: Ring,
  ruleId: ParkSolarRuleId,
  year: number,
  hour: number,
  minute: number,
): Ring[][] {
  const rule = solarRuleDefinition(ruleId);
  const when: PlanShadowInput = {
    lat: model.center.lat,
    lon: model.center.lon,
    year,
    month: rule.month,
    day: rule.day,
    hour,
    minute,
  };
  const proposedSplit = planShadowSplitRings(model, when, true, "off");
  const addedMulti = planShadowRingsToMulti(proposedSplit.added);
  if (addedMulti.length === 0) return [];
  const parkMulti = planShadowRingsToMulti([[parkRing]]);
  try {
    const clipped = polygonClipping.intersection(addedMulti, parkMulti) as MultiPolygon;
    return shadowRingsFromMulti(clipped);
  } catch {
    return [];
  }
}

export function parkAddedShadowForAssess(
  model: CityModel,
  parkRing: Ring,
  row: SolarParkAssessResult,
  year: number,
): Ring[][] {
  const step = representativeParkStep(row.stepAddedM2);
  if (!step) return [];
  return parkAddedShadowClipRings(model, parkRing, row.ruleId, year, step.hour, step.minute);
}
