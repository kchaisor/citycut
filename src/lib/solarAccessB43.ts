import { sunAtMelbourneLocal } from "./solar";
import { footprintArea } from "./useCascade";
import type { Pt, Ring } from "../types";

export const RESCODE_B43_MONTH = 9;
export const RESCODE_B43_DAY = 22;
export const RESCODE_B43_START_HOUR = 9;
export const RESCODE_B43_END_HOUR = 15;
export const RESCODE_B43_STEP_MINUTES = 15;
export const RESCODE_B43_REQUIRED_SUN_HOURS = 5;
export const RESCODE_B43_CAP_AREA_M2 = 25;
export const RESCODE_B43_MIN_DIMENSION_M = 3;
export const RESCODE_B43_AREA_FRACTION = 0.5;

export type RescodeB43Step = { hour: number; minute: number };

export function rescodeB43AssessmentSteps(lat: number, lon: number, year: number): RescodeB43Step[] {
  const out: RescodeB43Step[] = [];
  for (let hour = RESCODE_B43_START_HOUR; hour <= RESCODE_B43_END_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += RESCODE_B43_STEP_MINUTES) {
      if (hour === RESCODE_B43_END_HOUR && minute > 0) break;
      const sample = sunAtMelbourneLocal(lat, lon, year, RESCODE_B43_MONTH, RESCODE_B43_DAY, hour, minute);
      if (sample.aboveHorizon) out.push({ hour, minute });
    }
  }
  return out;
}

export function rescodeB43StepCount(lat: number, lon: number, year: number): number {
  return rescodeB43AssessmentSteps(lat, lon, year).length;
}

export function b43RequiredSunlitAreaM2(receptorAreaM2: number): number {
  if (!(receptorAreaM2 > 0)) return 0;
  return Math.min(receptorAreaM2 * RESCODE_B43_AREA_FRACTION, RESCODE_B43_CAP_AREA_M2);
}

export function b43UsesAreaCap(receptorAreaM2: number): boolean {
  return receptorAreaM2 > 0 && receptorAreaM2 * RESCODE_B43_AREA_FRACTION > RESCODE_B43_CAP_AREA_M2;
}

export function ringAxisMinDimensionM(ring: Ring): number {
  if (ring.length === 0) return 0;
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
  return Math.min(maxE - minE, maxN - minN);
}

export function b43MinDimensionSatisfied(receptorAreaM2: number, minDimensionM: number): boolean {
  if (!b43UsesAreaCap(receptorAreaM2)) return true;
  return minDimensionM >= RESCODE_B43_MIN_DIMENSION_M;
}

export function sunlitHoursFromLitSteps(litSteps: number, stepMinutes = RESCODE_B43_STEP_MINUTES): number {
  return (litSteps * stepMinutes) / 60;
}

export function meetsSunHourThreshold(litSteps: number, stepMinutes = RESCODE_B43_STEP_MINUTES): boolean {
  return sunlitHoursFromLitSteps(litSteps, stepMinutes) + 1e-9 >= RESCODE_B43_REQUIRED_SUN_HOURS;
}

export function receptorAreaM2(ring: Ring): number {
  return Math.abs(footprintArea(ring, []));
}

export type B43ComplianceVerdict = "pass" | "fail";

export function b43ComplianceVerdict(sunlitAreaM2: number, receptorAreaM2: number): B43ComplianceVerdict {
  return sunlitAreaM2 + 1e-6 >= b43RequiredSunlitAreaM2(receptorAreaM2) ? "pass" : "fail";
}

export type B43ProposalStatus =
  | { kind: "pass" }
  | { kind: "fail-proposal" }
  | { kind: "already-non-compliant"; addedShadowM2H: number }
  | { kind: "already-non-compliant-stable" };

export function b43ProposalStatus(
  existingSunlitM2: number,
  proposedSunlitM2: number,
  receptorAreaM2: number,
  addedShadowM2H: number,
): B43ProposalStatus {
  const existingPass = b43ComplianceVerdict(existingSunlitM2, receptorAreaM2) === "pass";
  const proposedPass = b43ComplianceVerdict(proposedSunlitM2, receptorAreaM2) === "pass";
  if (proposedPass) return { kind: "pass" };
  if (existingPass) return { kind: "fail-proposal" };
  if (addedShadowM2H > 0.05) return { kind: "already-non-compliant", addedShadowM2H };
  return { kind: "already-non-compliant-stable" };
}

export function b43StatusLabel(status: B43ProposalStatus): string {
  switch (status.kind) {
    case "pass":
      return "Passes";
    case "fail-proposal":
      return "Fails – proposal causes failure";
    case "already-non-compliant":
      return `Already non-compliant – proposal adds ${status.addedShadowM2H.toFixed(1)} m²·h of shadow`;
    case "already-non-compliant-stable":
      return "Already non-compliant – proposal does not add shadow";
  }
}

export function b43StatusTone(status: B43ProposalStatus): "pass" | "fail" | "warn" {
  switch (status.kind) {
    case "pass":
      return "pass";
    case "fail-proposal":
      return "fail";
    default:
      return "warn";
  }
}

export function ringFromCorners(a: Pt, b: Pt): Ring {
  const east0 = Math.min(a[0], b[0]);
  const east1 = Math.max(a[0], b[0]);
  const north0 = Math.min(a[1], b[1]);
  const north1 = Math.max(a[1], b[1]);
  return [
    [east0, north0],
    [east1, north0],
    [east1, north1],
    [east0, north1],
    [east0, north0],
  ];
}
