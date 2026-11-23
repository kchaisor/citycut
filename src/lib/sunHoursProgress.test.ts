import { describe, expect, it } from "vitest";
import {
  SUN_HOURS_GROUND_PROGRESS_SHARE,
  clampSunHoursProgress,
  combineSunHoursProgress,
  createThrottledProgress,
  reportSunHoursStep,
  sunHoursLegendBusy,
  sunHoursProgressPercent,
} from "./sunHoursProgress";

describe("sun hours calculating progress", () => {
  it("clamps and formats a fraction as a percent", () => {
    expect(clampSunHoursProgress(-1)).toBe(0);
    expect(clampSunHoursProgress(2)).toBe(1);
    expect(clampSunHoursProgress(Number.NaN)).toBe(0);
    expect(sunHoursProgressPercent(0.42)).toBe("42%");
    expect(sunHoursProgressPercent(1)).toBe("100%");
  });

  it("stays indeterminate until the ground worker reports a fraction", () => {
    expect(combineSunHoursProgress(null, null, "ground")).toBeNull();
  });

  it("maps ground and surface fractions onto one 0–1 bar, reaching 1 when surfaces finish", () => {
    expect(combineSunHoursProgress(0, null, "ground")).toBe(0);
    expect(combineSunHoursProgress(1, null, "ground")).toBe(SUN_HOURS_GROUND_PROGRESS_SHARE);
    expect(combineSunHoursProgress(1, 0, "surfaces")).toBe(SUN_HOURS_GROUND_PROGRESS_SHARE);
    expect(combineSunHoursProgress(1, 1, "surfaces")).toBe(1);
  });

  it("hides the bar once both jobs are done", () => {
    expect(sunHoursLegendBusy(true, false)).toBe(true);
    expect(sunHoursLegendBusy(false, true)).toBe(true);
    expect(sunHoursLegendBusy(false, false)).toBe(false);
  });

  it("reports step progress across a range", () => {
    const seen: number[] = [];
    reportSunHoursStep((value) => seen.push(value), 2, 4, 0, 1);
    expect(seen).toEqual([0.5]);
  });

  it("throttles noisy worker ticks but always emits completion", () => {
    const seen: number[] = [];
    const emit = createThrottledProgress((value) => seen.push(value), 0.02, 10_000);
    emit(0.1);
    emit(0.11);
    emit(1);
    expect(seen).toEqual([0.1, 1]);
  });
});
