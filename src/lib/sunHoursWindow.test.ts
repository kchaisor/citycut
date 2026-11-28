import { describe, expect, it } from "vitest";
import { daylightWindowMinutes } from "./solar";
import { directSunHoursAtSamples } from "./sunHoursDirectAssess";
import { directSunHoursSampleSet } from "./sunHoursDirectSample";
import { computeSunHoursGroundGrid } from "./sunHoursGroundPlan";
import { FAST_SUN_HOURS_PARAMS, SUN_HOURS_HIGH_STEP_MINUTES } from "./sunHoursQuality";
import { SUN_HOURS_GROUND_STEP_MINUTES } from "./sunHoursGround";
import {
  DEFAULT_SUN_HOURS_WINDOW,
  SUN_HOURS_FIXED_WINDOW_HOURS,
  SUN_HOURS_LEGEND_UNITS,
  SUN_HOURS_WINDOWS,
  sunHoursLegendSurfacesNote,
  sunHoursLegendTitle,
  sunHoursScaleMaxHours,
  sunHoursStudyMinutes,
} from "./sunHoursWindow";
import type { BuildingFeat, CityModel } from "../types";

const at = { lat: -37.8136, lon: 144.9631 };

function model(buildings: BuildingFeat[], sideM = 60): CityModel {
  return {
    placeLabel: "Test",
    center: at,
    sideM,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

const box: BuildingFeat = {
  id: 1,
  ring: [
    [-9, -9],
    [9, -9],
    [9, 9],
    [-9, 9],
    [-9, -9],
  ],
  holes: [],
  height: 12,
  use: "residential",
  source: "none",
};

const minutes = (window: "day" | "9to3", stepMinutes: number, month = 9, day = 22) =>
  sunHoursStudyMinutes(window, at.lat, at.lon, 2026, month, day, stepMinutes);

describe("Direct Sun Hours study window", () => {
  it("defaults to the whole day", () => {
    expect(DEFAULT_SUN_HOURS_WINDOW).toBe("day");
    expect(SUN_HOURS_WINDOWS.day.label).toBe("Whole day");
    expect(SUN_HOURS_WINDOWS["9to3"].label).toBe("9am–3pm");
  });

  it("counts 09:00 inclusive to 15:00 exclusive: 24 Fast steps and 72 High steps, both 6.0 h", () => {
    const fast = minutes("9to3", SUN_HOURS_GROUND_STEP_MINUTES);
    const high = minutes("9to3", SUN_HOURS_HIGH_STEP_MINUTES);
    expect(fast).toHaveLength(24);
    expect(high).toHaveLength(72);
    expect([fast[0], fast.at(-1)]).toEqual([9 * 60, 14 * 60 + 45]);
    expect([high[0], high.at(-1)]).toEqual([9 * 60, 14 * 60 + 55]);
    expect((fast.length * SUN_HOURS_GROUND_STEP_MINUTES) / 60).toBe(6);
    expect((high.length * SUN_HOURS_HIGH_STEP_MINUTES) / 60).toBe(6);
    for (const [month, day] of [
      [6, 21],
      [12, 22],
    ]) {
      expect(minutes("9to3", SUN_HOURS_GROUND_STEP_MINUTES, month, day)).toEqual(fast);
    }
  });

  it("keeps sunrise to sunset on the selected date for the whole day", () => {
    const daylight = daylightWindowMinutes(at.lat, at.lon, 2026, 6, 21)!;
    const steps = minutes("day", 15, 6, 21);
    expect(steps[0]).toBe(daylight.sunrise);
    expect(steps.at(-1)!).toBeLessThanOrEqual(daylight.sunset);
    expect(steps).toHaveLength(Math.floor((daylight.sunset - daylight.sunrise) / 15) + 1);
    expect(minutes("day", 15, 12, 22).length).toBeGreaterThan(steps.length);
  });

  it("gives open ground exactly 6 h in the 9am–3pm window at both step sizes", () => {
    for (const [stepMinutes, steps] of [
      [SUN_HOURS_GROUND_STEP_MINUTES, 24],
      [SUN_HOURS_HIGH_STEP_MINUTES, 72],
    ] as const) {
      const grid = computeSunHoursGroundGrid(model([]), 2026, 9, 22, 3, stepMinutes, undefined, "9to3")!;
      expect(grid.steps).toBe(steps);
      expect(grid.maxSunHours).toBe(6);
      expect(Math.min(...grid.sunHours)).toBe(6);
    }
    const wholeDay = computeSunHoursGroundGrid(model([]), 2026, 9, 22, 3, 15)!;
    expect(wholeDay.maxSunHours).toBeGreaterThan(6);
  });

  it("gives a fully lit roof sample 6 h in the 9am–3pm window, and more over the whole day", () => {
    const city = model([box]);
    const { samples } = directSunHoursSampleSet(city, FAST_SUN_HOURS_PARAMS);
    const roofIndex = samples.findIndex((sample) => sample.kind === "roof-cell");
    expect(roofIndex).toBeGreaterThanOrEqual(0);
    const windowed = directSunHoursAtSamples(city, samples, 2026, 9, 22, 15, undefined, "9to3")!;
    const wholeDay = directSunHoursAtSamples(city, samples, 2026, 9, 22, 15)!;
    expect(windowed[roofIndex]).toBe(6);
    expect(Math.max(...windowed)).toBe(6);
    expect(wholeDay[roofIndex]).toBeGreaterThan(6);
  });

  it("fixes the 9am–3pm scale at 6 h and leaves the whole-day scale at the observed max", () => {
    expect(SUN_HOURS_FIXED_WINDOW_HOURS).toBe(6);
    expect(sunHoursScaleMaxHours("9to3", 2.25)).toBe(6);
    expect(sunHoursScaleMaxHours("9to3", 0)).toBe(6);
    expect(sunHoursScaleMaxHours("day", 11.75)).toBe(11.75);
  });
});

describe("Direct Sun Hours legend title", () => {
  it("shows the selected date and the window, with hours as the units", () => {
    expect(sunHoursLegendTitle({ month: 9, day: 22, window: "9to3" })).toBe("Direct Sun Hours · 22 Sep · 9am–3pm");
    expect(sunHoursLegendTitle({ month: 9, day: 22, window: "day" })).toBe("Direct Sun Hours · 22 Sep · full daylight");
    expect(sunHoursLegendTitle({ month: 6, day: 21, window: "day" })).toBe("Direct Sun Hours · 21 Jun · full daylight");
    expect(sunHoursLegendTitle({ month: 12, day: 22, window: "9to3" })).toBe("Direct Sun Hours · 22 Dec · 9am–3pm");
    expect(sunHoursLegendTitle({ month: 3, day: 5, window: "day" })).toBe("Direct Sun Hours · 5 Mar · full daylight");
    expect(SUN_HOURS_LEGEND_UNITS).toBe("hours");
  });

  it("says which surfaces are coloured", () => {
    expect(sunHoursLegendSurfacesNote("day", false)).toBe("ground, roofs, walls · full daylight");
    expect(sunHoursLegendSurfacesNote("9to3", true)).toBe("selected roofs, walls · 9am–3pm");
  });
});
