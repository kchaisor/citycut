import type { FacadeAssessSummary, FacadeSolarRuleId, FacadeUnitResult } from "./facadeSolarTypes";

export const ADG_4A1_PROXY_NOTE =
  "Each 3 m floor–facade bay is treated as a dwelling unit proxy (NSW ADG 4A-1), not a real apartment count.";

export const VIC_D8_PROXY_NOTE =
  "Podium roof grid points stand in for communal open space receptors (Vic D8 / B37), not a certified survey.";

export const ADG_4A1_METRO_HOURS = 2;
export const ADG_4A1_REGIONAL_HOURS = 3;
export const ADG_4A1_MIN_PCT_AT_THRESHOLD = 70;
export const ADG_4A1_MAX_PCT_NONE = 15;

export const VIC_D8_MIN_HOURS = 2;
export const VIC_D8_MIN_PCT = 50;
export const VIC_D8_MIN_AREA_M2 = 125;

export type FacadeRuleDefinition = {
  id: FacadeSolarRuleId;
  label: string;
  month: number;
  day: number;
  hours: readonly number[];
  thresholdHours: number;
};

export const FACADE_RULES: Record<FacadeSolarRuleId, FacadeRuleDefinition> = {
  "nsw-adg-4a1": {
    id: "nsw-adg-4a1",
    label: "NSW ADG 4A-1 (21 Jun)",
    month: 6,
    day: 21,
    hours: [9, 10, 11, 12, 13, 14, 15],
    thresholdHours: ADG_4A1_REGIONAL_HOURS,
  },
  "vic-d8-b37-podium": {
    id: "vic-d8-b37-podium",
    label: "Vic D8 / B37 podium open space",
    month: 6,
    day: 21,
    hours: [9, 10, 11, 12, 13, 14, 15],
    thresholdHours: VIC_D8_MIN_HOURS,
  },
};

export function summarizeFacadeUnits(
  rule: FacadeRuleDefinition,
  proxyNote: string,
  units: FacadeUnitResult[],
  assessMs: number,
  extraPass?: (units: FacadeUnitResult[]) => boolean,
): FacadeAssessSummary {
  const n = units.length;
  const atThreshold = units.filter((unit) => unit.meetsThreshold).length;
  const none = units.filter((unit) => unit.none).length;
  const pctAtThreshold = n ? (100 * atThreshold) / n : 0;
  const pctNone = n ? (100 * none) / n : 0;
  const basePass =
    n > 0 && pctAtThreshold + 1e-6 >= ADG_4A1_MIN_PCT_AT_THRESHOLD && pctNone - 1e-6 <= ADG_4A1_MAX_PCT_NONE;
  const pass = rule.id === "nsw-adg-4a1" ? basePass : Boolean(extraPass?.(units));
  return {
    ruleId: rule.id,
    ruleLabel: rule.label,
    proxyNote,
    unitCount: n,
    thresholdHours: rule.thresholdHours,
    pctAtThreshold,
    pctNone,
    pass,
    statusNote:
      rule.id === "nsw-adg-4a1"
        ? `≥${rule.thresholdHours} h direct sun 9–15 · need ≥${ADG_4A1_MIN_PCT_AT_THRESHOLD}% units & ≤${ADG_4A1_MAX_PCT_NONE}% none`
        : `≥${rule.thresholdHours} h on roof receptors · need ≥${VIC_D8_MIN_PCT}% or ${VIC_D8_MIN_AREA_M2} m²`,
    assessMs,
    units,
  };
}

export function vicD8ExtraPass(units: FacadeUnitResult[], gridM: number): boolean {
  const cell = gridM * gridM;
  const ok = units.filter((unit) => unit.meetsThreshold);
  const okArea = ok.length * cell;
  const pct = units.length ? (100 * ok.length) / units.length : 0;
  return pct + 1e-6 >= VIC_D8_MIN_PCT || okArea + 1e-6 >= VIC_D8_MIN_AREA_M2;
}
