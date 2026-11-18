import { describe, expect, it } from "vitest";
import { sweepMinute } from "./solar";
import {
  SOLAR_SLIDER_END_MIN,
  SOLAR_SLIDER_START_MIN,
  SOLAR_SLIDER_TICK_HOURS,
  SOLAR_SLIDER_WINDOW,
  clampSolarSliderMinutes,
  isRescodeHour,
  solarSliderPercent,
  solarSliderSpan,
} from "./solarSlider";

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
});
