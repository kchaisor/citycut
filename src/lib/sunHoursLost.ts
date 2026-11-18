import type { ColourKey } from "./colours";
import { RESCODE_B43_STEP_MINUTES } from "./solarAccessB43";

export const SUN_HOURS_LOST_CELL_M = 3;

export function sunHoursLostFromStepCounts(
  existingLitSteps: number,
  proposedLitSteps: number,
  stepMinutes = RESCODE_B43_STEP_MINUTES,
): number {
  const stepHours = stepMinutes / 60;
  return Math.max(0, (existingLitSteps - proposedLitSteps) * stepHours);
}

export function sunHoursLostBucket(hours: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (hours < 0.01) return 0;
  return Math.min(5, Math.ceil(hours - 1e-9)) as 1 | 2 | 3 | 4 | 5;
}

const BUCKET_KEYS: Record<1 | 2 | 3 | 4 | 5, ColourKey> = {
  1: "--sun-hours-lost-1",
  2: "--sun-hours-lost-2",
  3: "--sun-hours-lost-3",
  4: "--sun-hours-lost-4",
  5: "--sun-hours-lost-5plus",
};

export function sunHoursLostColourKey(hours: number): ColourKey | null {
  const bucket = sunHoursLostBucket(hours);
  if (bucket === 0) return null;
  return BUCKET_KEYS[bucket];
}

export const SUN_HOURS_LOST_LEGEND: { label: string; key: ColourKey }[] = [
  { label: "0", key: "--sun-hours-lost-0" },
  { label: "1", key: "--sun-hours-lost-1" },
  { label: "2", key: "--sun-hours-lost-2" },
  { label: "3", key: "--sun-hours-lost-3" },
  { label: "4", key: "--sun-hours-lost-4" },
  { label: "5+", key: "--sun-hours-lost-5plus" },
];
