import { describe, expect, it } from "vitest";
import {
  SUN_STUDY_HOURS,
  hiddenBySunStudy,
  sunStudyDateArc,
  sunStudyHourKey,
  sunStudyHourLabel,
  sunStudyModelKey,
  sunStudySuns,
} from "./sunStudyPlan";
import type { CityModel } from "../types";

const kew = { lat: -37.8045, lon: 145.0215, year: 2026, month: 9, day: 22 };

describe("sun study plan", () => {
  it("covers 9am to 3pm with am/pm labels", () => {
    expect([...SUN_STUDY_HOURS]).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(SUN_STUDY_HOURS.map(sunStudyHourLabel)).toEqual(["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm"]);
  });

  it("places hourly suns east in the morning, north at noon, west after", () => {
    const suns = sunStudySuns(kew, 100, 6.5, 4);
    expect(suns.map((s) => s.hour)).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(suns[0]!.at[0]).toBeGreaterThan(0);
    expect(suns[6]!.at[0]).toBeLessThan(0);
    for (const sun of suns) {
      expect(sun.at[1]).toBeGreaterThan(0); // southern hemisphere: sun to the north
      expect(Math.hypot(...sun.at)).toBeLessThanOrEqual(100.0001);
      // label pulled inward, clear of the sun icon
      expect(Math.hypot(...sun.labelAt)).toBeLessThan(Math.hypot(...sun.at) - 6.5);
    }
  });

  it("hides heliodon hour labels that sit on a study sun", () => {
    const suns = sunStudySuns(kew, 100, 6.5, 4);
    const noon = suns.find((s) => s.hour === 12)!;
    expect(hiddenBySunStudy({ east: noon.at[0] + 3, north: noon.at[1] }, suns, 100)).toBe(true);
    expect(hiddenBySunStudy({ east: 0, north: -90 }, suns, 100)).toBe(false);
  });

  it("draws the selected-date arc in daylight only", () => {
    const arc = sunStudyDateArc(kew, 100);
    expect(arc.length).toBeGreaterThan(50);
    for (const [e, n] of arc) expect(Math.hypot(e, n)).toBeLessThanOrEqual(100.0001);
  });

  it("keys the per-hour cache by model, date and hour", () => {
    const model = { sideM: 1000, buildings: [], terrain: null } as unknown as CityModel;
    const key = sunStudyModelKey(model);
    expect(sunStudyHourKey(key, kew, 9)).not.toBe(sunStudyHourKey(key, kew, 10));
    expect(sunStudyHourKey(key, kew, 9)).not.toBe(sunStudyHourKey(key, { ...kew, day: 23 }, 9));
    expect(sunStudyModelKey({ ...model, sideM: 500 })).not.toBe(key);
  });
});
