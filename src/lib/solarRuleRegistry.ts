import { sunAtMelbourneLocal } from "./solar";
import { RESCODE_B43_STEP_MINUTES } from "./solarAccessB43";

export const PARK_NO_ADDITIONAL_TOLERANCE_M2 = 0.5;

export type SolarRuleKind = "b43" | "noAdditional";

export type SolarReceptorKind = "yard" | "park";

export type ParkSolarRuleId =
  | "melbourne-c415-ddo8"
  | "melbourne-ddo10-yarra"
  | "melbourne-cl22-park"
  | "sydney-lep617";

export type SolarRuleId = "rescode-b43" | ParkSolarRuleId;

export type SolarRuleStep = { hour: number; minute: number };

export type SolarRuleDefinition = {
  id: SolarRuleId;
  kind: SolarRuleKind;
  label: string;
  statusNote: string;
  month: number;
  day: number;
  hours: readonly number[];
  stepMinutes: number;
};

export const SOLAR_RULE_REGISTRY: Record<SolarRuleId, SolarRuleDefinition> = {
  "rescode-b43": {
    id: "rescode-b43",
    kind: "b43",
    label: "ResCode B4-3 / A4-3",
    statusNote: "Clause 55.04-3",
    month: 9,
    day: 22,
    hours: [9, 10, 11, 12, 13, 14, 15],
    stepMinutes: RESCODE_B43_STEP_MINUTES,
  },
  "melbourne-c415-ddo8": {
    id: "melbourne-c415-ddo8",
    kind: "noAdditional",
    label: "Melbourne C415 / DDO8 parks",
    statusNote: "Proposed, awaiting Minister",
    month: 6,
    day: 21,
    hours: [10, 11, 12, 13, 14, 15],
    stepMinutes: 60,
  },
  "melbourne-ddo10-yarra": {
    id: "melbourne-ddo10-yarra",
    kind: "noAdditional",
    label: "Melbourne DDO10 Yarra corridor",
    statusNote: "Check current DDO10",
    month: 6,
    day: 22,
    hours: [11, 12, 13, 14],
    stepMinutes: 60,
  },
  "melbourne-cl22-park": {
    id: "melbourne-cl22-park",
    kind: "noAdditional",
    label: "Melbourne Cl 22.02 parks (outside Hoddle Grid)",
    statusNote: "Detail not verified",
    month: 9,
    day: 22,
    hours: [11, 12, 13, 14],
    stepMinutes: 60,
  },
  "sydney-lep617": {
    id: "sydney-lep617",
    kind: "noAdditional",
    label: "Sydney LEP 2012 cl 6.17 / 6.19 (Martin Place-style)",
    statusNote: "Dates not verified",
    month: 4,
    day: 22,
    hours: [12, 13, 14],
    stepMinutes: 60,
  },
};

export const PARK_SOLAR_RULE_IDS = Object.keys(SOLAR_RULE_REGISTRY).filter(
  (id) => SOLAR_RULE_REGISTRY[id as SolarRuleId].kind === "noAdditional",
) as ParkSolarRuleId[];

export function solarRuleDefinition(ruleId: SolarRuleId): SolarRuleDefinition {
  return SOLAR_RULE_REGISTRY[ruleId];
}

export function defaultParkRuleId(): ParkSolarRuleId {
  return "melbourne-ddo10-yarra";
}

export function solarRuleAssessmentSteps(lat: number, lon: number, year: number, rule: SolarRuleDefinition): SolarRuleStep[] {
  const out: SolarRuleStep[] = [];
  for (const hour of rule.hours) {
    for (let minute = 0; minute < 60; minute += rule.stepMinutes) {
      const sample = sunAtMelbourneLocal(lat, lon, year, rule.month, rule.day, hour, minute);
      if (sample.aboveHorizon) out.push({ hour, minute });
    }
  }
  return out;
}

export function parkRuleForReceptor(receptor: { kind?: SolarReceptorKind; ruleId?: string }): SolarRuleDefinition | null {
  if ((receptor.kind ?? "yard") !== "park") return null;
  const id = (receptor.ruleId ?? defaultParkRuleId()) as SolarRuleId;
  const rule = SOLAR_RULE_REGISTRY[id];
  return rule?.kind === "noAdditional" ? rule : null;
}
