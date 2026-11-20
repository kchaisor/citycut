export const SOLAR_SLIDER_START_MIN = 6 * 60;
export const SOLAR_SLIDER_END_MIN = 20 * 60;
export const SOLAR_SLIDER_STEP_MIN = 5;
export const SOLAR_SLIDER_TICK_HOURS = [6, 9, 10, 11, 12, 13, 14, 15, 18, 20] as const;
export const RESCODE_WINDOW_START_HOUR = 9;
export const RESCODE_WINDOW_END_HOUR = 15;

export const SOLAR_SLIDER_WINDOW = { sunrise: SOLAR_SLIDER_START_MIN, sunset: SOLAR_SLIDER_END_MIN } as const;

export function clampSolarSliderMinutes(minutes: number): number {
  return Math.min(SOLAR_SLIDER_END_MIN, Math.max(SOLAR_SLIDER_START_MIN, minutes));
}

export function solarSliderPercent(minutes: number): number {
  const span = SOLAR_SLIDER_END_MIN - SOLAR_SLIDER_START_MIN;
  return ((clampSolarSliderMinutes(minutes) - SOLAR_SLIDER_START_MIN) / span) * 100;
}

export function isRescodeHour(hour: number): boolean {
  return hour >= RESCODE_WINDOW_START_HOUR && hour <= RESCODE_WINDOW_END_HOUR;
}

export function solarSliderSpan(fromMinutes: number, toMinutes: number): { left: number; width: number } {
  const left = solarSliderPercent(fromMinutes);
  return { left, width: Math.max(0, solarSliderPercent(toMinutes) - left) };
}
