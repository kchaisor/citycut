import { sunAtMelbourneLocal } from "./solar";
import { buildingHeightsFingerprint } from "./heightOverrides";
import type { PlanShadowInput } from "./buildingShadows";
import type { CityModel, Pt } from "../types";

/** Site plan sun study: one shadow layer per clock hour, 9am to 3pm local time. */
export const SUN_STUDY_HOURS = [9, 10, 11, 12, 13, 14, 15] as const;

/** Per-hour shadow fill opacity; layers overlap so longer-shaded ground reads darker. */
export const SUN_STUDY_SHADOW_OPACITY = 0.2;

export function sunStudyHourLabel(hour: number): string {
  if (hour === 12) return "12pm";
  if (hour === 0 || hour === 24) return "12am";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export type SunStudyDate = Pick<PlanShadowInput, "lat" | "lon" | "year" | "month" | "day">;

/** Stable key for the geometry that shadows depend on (not the date or hour). */
export function sunStudyModelKey(model: CityModel): string {
  const t = model.terrain;
  return [
    model.sideM,
    model.frameShape ?? "square",
    t ? `${t.cols}x${t.rows}:${t.min}:${t.max}` : "flat",
    model.buildings.length,
    buildingHeightsFingerprint(model.buildings),
  ].join("|");
}

export function sunStudyHourKey(modelKey: string, date: SunStudyDate, hour: number): string {
  return `${modelKey}|${date.lat}|${date.lon}|${date.year}-${date.month}-${date.day}|${hour}`;
}

export type SunStudySun = {
  hour: number;
  label: string;
  /** Sun position on the plan diagram, metres east and north of the centre. */
  at: Pt;
  /** Label centre, pulled inward toward the centre so it clears the sun's rays. */
  labelAt: Pt;
};

/**
 * Hourly sun positions on the selected date's path, on the same diagram radius as the plan
 * heliodon. Hours with the sun below the horizon are skipped.
 */
export function sunStudySuns(date: SunStudyDate, radiusM: number, sunSize: number, labelSize: number): SunStudySun[] {
  const suns: SunStudySun[] = [];
  for (const hour of SUN_STUDY_HOURS) {
    const sample = sunAtMelbourneLocal(date.lat, date.lon, date.year, date.month, date.day, hour, 0);
    if (!sample.aboveHorizon) continue;
    const east = sample.direction[0] * radiusM;
    const north = -sample.direction[2] * radiusM;
    const len = Math.hypot(east, north) || 1;
    const k = Math.min(1, (sunSize + labelSize * 1.1) / len);
    suns.push({
      hour,
      label: sunStudyHourLabel(hour),
      at: [east, north],
      labelAt: [east - east * k, north - north * k],
    });
  }
  return suns;
}

/** True when a heliodon hour label sits on a sun-study sun and would duplicate it. */
export function hiddenBySunStudy(label: { east: number; north: number }, suns: SunStudySun[], radiusM: number): boolean {
  return suns.some((sun) => Math.hypot(label.east - sun.at[0], label.north - sun.at[1]) < radiusM * 0.09);
}

/** Selected-date arc points (east, north) for the plan diagram, 10-minute steps over daylight. */
export function sunStudyDateArc(date: SunStudyDate, radiusM: number): Pt[] {
  const points: Pt[] = [];
  for (let minutes = 4 * 60; minutes <= 21 * 60; minutes += 10) {
    const s = sunAtMelbourneLocal(date.lat, date.lon, date.year, date.month, date.day, Math.floor(minutes / 60), minutes % 60);
    if (!s.aboveHorizon) continue;
    points.push([s.direction[0] * radiusM, -s.direction[2] * radiusM]);
  }
  return points;
}

/** Tree crown opacity in the sun study muted base plan. */
export const SUN_STUDY_TREE_OPACITY = 0.5;

/** The muted base plan is on by default with the sun study; only an explicit false turns it off. */
export function sunStudyMutedOn(sunStudy: boolean | undefined, muted: boolean | undefined): boolean {
  return Boolean(sunStudy) && muted !== false;
}
