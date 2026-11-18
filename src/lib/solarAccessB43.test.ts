import { describe, expect, it } from "vitest";
import {
  RESCODE_B43_REQUIRED_SUN_HOURS,
  RESCODE_B43_STEP_MINUTES,
  b43ComplianceVerdict,
  b43MinDimensionSatisfied,
  b43ProposalStatus,
  b43RequiredSunlitAreaM2,
  b43StatusLabel,
  b43UsesAreaCap,
  meetsSunHourThreshold,
  receptorAreaM2,
  rescodeB43AssessmentSteps,
  ringAxisMinDimensionM,
  ringFromCorners,
  sunlitHoursFromLitSteps,
} from "./solarAccessB43";

const MELBOURNE = { lat: -37.8136, lon: 144.9631 };
const YEAR = 2026;

describe("ResCode B4-3 area rule", () => {
  it("uses half the receptor area when under the 25 m² cap", () => {
    expect(b43RequiredSunlitAreaM2(40)).toBe(20);
    expect(b43UsesAreaCap(40)).toBe(false);
    expect(b43RequiredSunlitAreaM2(50)).toBe(25);
    expect(b43UsesAreaCap(50)).toBe(false);
  });

  it("caps the test patch at 25 m² when half the area would exceed it", () => {
    expect(b43RequiredSunlitAreaM2(60)).toBe(25);
    expect(b43UsesAreaCap(60)).toBe(true);
    expect(b43RequiredSunlitAreaM2(200)).toBe(25);
  });

  it("requires a 3 m minimum dimension only when the 25 m² cap applies", () => {
    expect(b43MinDimensionSatisfied(40, 2)).toBe(true);
    expect(b43MinDimensionSatisfied(80, 2.9)).toBe(false);
    expect(b43MinDimensionSatisfied(80, 3)).toBe(true);
    const narrowLarge = ringFromCorners([0, 0], [20, 2.8]);
    expect(receptorAreaM2(narrowLarge)).toBeCloseTo(56, 0);
    expect(b43UsesAreaCap(receptorAreaM2(narrowLarge))).toBe(true);
    expect(ringAxisMinDimensionM(narrowLarge)).toBeCloseTo(2.8, 5);
    expect(b43MinDimensionSatisfied(receptorAreaM2(narrowLarge), ringAxisMinDimensionM(narrowLarge))).toBe(false);
  });
});

describe("ResCode B4-3 5-hour threshold at 15-minute steps", () => {
  it("counts hours from lit step counts", () => {
    expect(sunlitHoursFromLitSteps(20)).toBe(RESCODE_B43_REQUIRED_SUN_HOURS);
    expect(meetsSunHourThreshold(20)).toBe(true);
    expect(meetsSunHourThreshold(19)).toBe(false);
    expect(RESCODE_B43_STEP_MINUTES).toBe(15);
  });

  it("steps 22 Sep 9am–3pm Melbourne in 15-minute increments while the sun is up", () => {
    const steps = rescodeB43AssessmentSteps(MELBOURNE.lat, MELBOURNE.lon, YEAR);
    expect(steps[0]).toEqual({ hour: 9, minute: 0 });
    expect(steps[steps.length - 1]).toEqual({ hour: 15, minute: 0 });
    expect(steps.filter((step) => step.minute % 15 === 0).length).toBe(steps.length);
    expect(steps.length).toBeGreaterThanOrEqual(20);
  });
});

describe("ResCode B4-3 proposal status labels", () => {
  it("passes when proposed sunlit area meets the rule", () => {
    expect(b43ComplianceVerdict(25, 80)).toBe("pass");
    expect(b43ProposalStatus(10, 25, 80, 0).kind).toBe("pass");
    expect(b43StatusLabel(b43ProposalStatus(10, 25, 80, 0))).toBe("Passes");
  });

  it("flags a proposal that pushes a compliant backyard into failure", () => {
    const status = b43ProposalStatus(25, 10, 80, 4);
    expect(status.kind).toBe("fail-proposal");
    expect(b43StatusLabel(status)).toBe("Fails – proposal causes failure");
  });

  it("reports added shadow when already non-compliant", () => {
    const status = b43ProposalStatus(5, 3, 80, 12.4);
    expect(status.kind).toBe("already-non-compliant");
    expect(b43StatusLabel(status)).toContain("12.4");
  });
});
