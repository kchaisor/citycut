import { describe, expect, it } from "vitest";
import {
  SINGLE_SHADOW_OPACITY,
  SUN_STUDY_HOURS,
  SUN_STUDY_SHADOW_OPACITY,
  estimatedHeightLabels,
  isClick,
  pickBuilding,
  sunStudyCasterModel,
  toggleSelection,
  hiddenBySunStudy,
  sunStudyDateArc,
  sunStudyHourKey,
  sunStudyHourLabel,
  sunStudyModelKey,
  sunStudySuns,
} from "./sunStudyPlan";
import type { BuildingFeat, CityModel } from "../types";

const kew = { lat: -37.8045, lon: 145.0215, year: 2026, month: 9, day: 22 };

describe("sun study plan", () => {
  it("uses 0.5 opacity for single-hour shadows and keeps 0.2 opacity for 9am-3pm sun study slices", () => {
    expect(SINGLE_SHADOW_OPACITY).toBe(0.5);
    expect(SUN_STUDY_SHADOW_OPACITY).toBe(0.2);
  });

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
      expect(sun.at[1]).toBeGreaterThan(0);
      expect(Math.hypot(...sun.at)).toBeLessThanOrEqual(100.0001);
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

const sq = (id: number, e: number, n: number, size: number, extra: Partial<BuildingFeat> = {}): BuildingFeat => {
  const h = size / 2;
  return {
    id,
    ring: [[e - h, n - h], [e + h, n - h], [e + h, n + h], [e - h, n + h], [e - h, n - h]],
    holes: [],
    height: 12.4,
    use: "unclassified",
    source: "none",
    ...extra,
  };
};

describe("sun study selection", () => {
  it("treats up to 4 px of travel as a click and more as a drag", () => {
    expect(isClick(0, 0)).toBe(true);
    expect(isClick(3, 2)).toBe(true);
    expect(isClick(4, 0)).toBe(true);
    expect(isClick(4, 1)).toBe(false);
    expect(isClick(0, -12)).toBe(false);
  });

  it("picks the smallest footprint under the point and misses empty ground", () => {
    const big = sq(1, 0, 0, 40);
    const small = sq(2, 5, 5, 6);
    expect(pickBuilding([big, small], [5, 5])?.id).toBe(2);
    expect(pickBuilding([big, small], [-15, -15])?.id).toBe(1);
    expect(pickBuilding([big, small], [100, 100])).toBeNull();
  });

  it("toggles ids and limits casters to the selection", () => {
    expect(toggleSelection([1, 2], 2)).toEqual([1]);
    expect(toggleSelection([1], 3)).toEqual([1, 3]);
    const model = { sideM: 200, buildings: [sq(1, 0, 0, 10), sq(2, 30, 0, 10)] } as unknown as CityModel;
    expect(sunStudyCasterModel(model, "all", [2])).toBe(model);
    expect(sunStudyCasterModel(model, "selected", [2]).buildings.map((b) => b.id)).toEqual([2]);
    expect(sunStudyCasterModel(model, "selected", []).buildings).toEqual([]);
    expect(sunStudyModelKey(sunStudyCasterModel(model, "selected", [2]))).not.toBe(sunStudyModelKey(model));
  });

  it("labels estimated heights only, always when selected, otherwise when the label fits", () => {
    const measured = sq(1, 0, 0, 80);
    const estWide = sq(2, 100, 0, 80, { heightFromFallback: true });
    const estSmall = sq(3, 200, 0, 4, { heightTier: "real_source_unmatched" });
    const font = 3;
    expect(estimatedHeightLabels([measured, estWide, estSmall], [], font).map((l) => l.id)).toEqual([2]);
    const withSel = estimatedHeightLabels([measured, estWide, estSmall], [3], font);
    expect(withSel.map((l) => [l.id, l.text])).toEqual([
      [2, "~12 m est."],
      [3, "~12 m est."],
    ]);
  });
});
