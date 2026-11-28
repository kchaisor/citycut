import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sweepMinute } from "./solar";
import {
  SOLAR_SLIDER_END_MIN,
  SOLAR_SLIDER_FULL_TICKS_MIN_TRACK_PX,
  SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX,
  SOLAR_SLIDER_START_MIN,
  SOLAR_SLIDER_TICK_HOURS,
  SOLAR_SLIDER_TICK_MIN_GAP_PX,
  SOLAR_SLIDER_WINDOW,
  clampSolarSliderMinutes,
  isRescodeHour,
  solarSliderPercent,
  solarSliderSpan,
  solarSliderTickHoursAt,
  solarSliderTickMinGap,
  solarSliderTickTier,
} from "./solarSlider";
import { SOLAR_CARD_TICK_HOURS } from "../components/model/solarStudyCard";

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const TRACK_PX_AT_1440 = 400.6;
const TRACK_PX_AT_1280 = 240.6;

describe("solar time slider", () => {
  it("runs from 6am to 8pm", () => {
    expect(SOLAR_SLIDER_START_MIN).toBe(360);
    expect(SOLAR_SLIDER_END_MIN).toBe(1200);
  });

  it("has ticks at 06 and 20 with the 09–15 ResCode window highlighted", () => {
    expect(SOLAR_SLIDER_TICK_HOURS[0]).toBe(6);
    expect(SOLAR_SLIDER_TICK_HOURS.at(-1)).toBe(20);
    expect(SOLAR_SLIDER_TICK_HOURS.filter(isRescodeHour)).toEqual([9, 10, 11, 12, 13, 14, 15]);
  });

  it("accepts 6:00 and 20:00 and clamps outside them", () => {
    expect(clampSolarSliderMinutes(360)).toBe(360);
    expect(clampSolarSliderMinutes(1200)).toBe(1200);
    expect(clampSolarSliderMinutes(300)).toBe(360);
    expect(clampSolarSliderMinutes(1260)).toBe(1200);
    expect(solarSliderPercent(360)).toBe(0);
    expect(solarSliderPercent(1200)).toBe(100);
    expect(solarSliderPercent(780)).toBe(50);
  });

  it("places the daylight band inside the track", () => {
    const winter = solarSliderSpan(456, 1026);
    expect(winter.left).toBeCloseTo((96 / 840) * 100, 6);
    expect(winter.left + winter.width).toBeCloseTo((666 / 840) * 100, 6);
    const summer = solarSliderSpan(355, 1250);
    expect(summer).toEqual({ left: 0, width: 100 });
  });

  it("plays through night hours and wraps 20:00 back to 6:00", () => {
    expect(sweepMinute(360, 1, 1, SOLAR_SLIDER_WINDOW)).toBe(420);
    expect(sweepMinute(1170, 1, 1, SOLAR_SLIDER_WINDOW)).toBe(360);
  });

  it("keeps every hour label at 1440 wide, where they all fit", () => {
    expect(solarSliderTickHoursAt(TRACK_PX_AT_1440)).toEqual([...SOLAR_SLIDER_TICK_HOURS]);
    expect(solarSliderTickMinGap(SOLAR_SLIDER_TICK_HOURS, TRACK_PX_AT_1440)).toBeGreaterThanOrEqual(SOLAR_SLIDER_TICK_MIN_GAP_PX);
  });

  it("drops the in-between hours at 1280 wide, where 09 to 15 would overlap", () => {
    expect(solarSliderTickMinGap(SOLAR_SLIDER_TICK_HOURS, TRACK_PX_AT_1280)).toBeLessThan(0);
    const shown = solarSliderTickHoursAt(TRACK_PX_AT_1280);
    expect(shown).toEqual([6, 9, 12, 15, 18, 20]);
    expect(solarSliderTickMinGap(shown, TRACK_PX_AT_1280)).toBeGreaterThanOrEqual(SOLAR_SLIDER_TICK_MIN_GAP_PX);
  });

  it("never lets shown hour labels touch, and always keeps 09, 12 and 15", () => {
    for (let width = 112; width <= 720; width++) {
      const shown = solarSliderTickHoursAt(width);
      expect(shown).toEqual(expect.arrayContaining([6, 9, 12, 15, 20]));
      expect(solarSliderTickMinGap(shown, width), `track ${width}px`).toBeGreaterThanOrEqual(SOLAR_SLIDER_TICK_MIN_GAP_PX);
    }
    expect(solarSliderTickHoursAt(SOLAR_SLIDER_FULL_TICKS_MIN_TRACK_PX - 1)).not.toContain(10);
    expect(solarSliderTickHoursAt(SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX - 1)).not.toContain(18);
  });

  it("sorts ticks into core, late and minor tiers", () => {
    expect(SOLAR_SLIDER_TICK_HOURS.map(solarSliderTickTier)).toEqual([
      "core",
      "core",
      "minor",
      "minor",
      "core",
      "minor",
      "minor",
      "core",
      "late",
      "core",
    ]);
  });

  it("labels the card slider with the core and late hours, under a rail that shares the thumb inset", () => {
    expect(SOLAR_CARD_TICK_HOURS).toEqual([6, 9, 12, 15, 18, 20]);
    expect(SOLAR_CARD_TICK_HOURS).toEqual(solarSliderTickHoursAt(SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX));
    expect(solarSliderTickHoursAt(SOLAR_SLIDER_FULL_TICKS_MIN_TRACK_PX)).toEqual([...SOLAR_SLIDER_TICK_HOURS]);
    const card = source("src/components/model/SolarStudyHudCard.tsx");
    expect(card).toContain("SOLAR_CARD_TICK_HOURS.map");
    expect(card).toContain("min={SOLAR_SLIDER_START_MIN}");
    expect(card).toContain("max={SOLAR_SLIDER_END_MIN}");
    const index = source("src/index.css");
    const rule = (selector: string) => {
      const start = index.indexOf(`${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return index.slice(start, index.indexOf("}", start));
    };
    const inset = /margin: (0 calc\([^;]+\));/.exec(rule(".ac-scrub"))?.[1];
    expect(inset).toBeTruthy();
    expect(rule(".ac-ticks")).toContain(`margin: ${inset};`);
    expect(rule(".ac-ticks")).toMatch(/grid-column: 3;/);
    expect(source("src/floating.css")).not.toContain("scrubber-tick-btn");
    expect(source("src/components/model/ModelPageViewportFooter.tsx")).not.toContain("Solar time of day");
  });
});
