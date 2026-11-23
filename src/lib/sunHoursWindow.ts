import { SUN_STUDY_DATES, daylightWindowMinutes } from "./solar";
import { RESCODE_WINDOW_END_HOUR, RESCODE_WINDOW_START_HOUR } from "./solarSlider";

export type SunHoursWindow = "day" | "9to3";

export const DEFAULT_SUN_HOURS_WINDOW: SunHoursWindow = "day";
export const SUN_HOURS_WINDOW_IDS = ["day", "9to3"] as const satisfies readonly SunHoursWindow[];
export const SUN_HOURS_WINDOWS: Record<SunHoursWindow, { label: string; legend: string }> = {
  day: { label: "Whole day", legend: "full daylight" },
  "9to3": { label: "9am–3pm", legend: "9am–3pm" },
};
export const SUN_HOURS_FIXED_WINDOW_START_MIN = RESCODE_WINDOW_START_HOUR * 60;
export const SUN_HOURS_FIXED_WINDOW_END_MIN = RESCODE_WINDOW_END_HOUR * 60;
export const SUN_HOURS_FIXED_WINDOW_HOURS = (SUN_HOURS_FIXED_WINDOW_END_MIN - SUN_HOURS_FIXED_WINDOW_START_MIN) / 60;
export const SUN_HOURS_LEGEND_UNITS = "hours";

export type SunHoursStudy = { month: number; day: number; window: SunHoursWindow };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function sunHoursStudyMinutes(
  window: SunHoursWindow,
  lat: number,
  lon: number,
  year: number,
  month: number,
  day: number,
  stepMinutes: number,
): number[] {
  if (!(stepMinutes > 0)) return [];
  const minutes: number[] = [];
  if (window === "9to3") {
    for (let minute = SUN_HOURS_FIXED_WINDOW_START_MIN; minute < SUN_HOURS_FIXED_WINDOW_END_MIN; minute += stepMinutes) {
      minutes.push(minute);
    }
    return minutes;
  }
  const daylight = daylightWindowMinutes(lat, lon, year, month, day);
  if (!daylight) return [];
  for (let minute = daylight.sunrise; minute <= daylight.sunset; minute += stepMinutes) minutes.push(minute);
  return minutes;
}

export function sunHoursScaleMaxHours(window: SunHoursWindow, observedMaxHours: number): number {
  return window === "9to3" ? SUN_HOURS_FIXED_WINDOW_HOURS : observedMaxHours;
}

export function sunHoursStudyDateLabel(month: number, day: number): string {
  const preset = SUN_STUDY_DATES.find((date) => date.month === month && date.day === day);
  return preset ? preset.label : `${day} ${MONTHS[month - 1] ?? ""}`.trim();
}

export function sunHoursLegendTitle(study: SunHoursStudy): string {
  return `Direct Sun Hours · ${sunHoursStudyDateLabel(study.month, study.day)} · ${SUN_HOURS_WINDOWS[study.window].legend}`;
}

export function sunHoursLegendSurfacesNote(window: SunHoursWindow, pickedOnly: boolean): string {
  return `${pickedOnly ? "selected roofs, walls" : "ground, roofs, walls"} · ${SUN_HOURS_WINDOWS[window].legend}`;
}
