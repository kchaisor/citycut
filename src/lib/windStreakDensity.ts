import { useSyncExternalStore } from "react";

export const WIND_STREAK_DENSITY_KEY = "citycut.wind.streakDensity";
export const WIND_STREAK_DENSITY_MIN = 0.5;
export const WIND_STREAK_DENSITY_MAX = 2.5;
export const WIND_STREAK_DENSITY_STEP = 0.1;
export const WIND_STREAK_DENSITY_DEFAULT = 1;

export function clampWindStreakDensity(value: number): number {
  if (!Number.isFinite(value)) return WIND_STREAK_DENSITY_DEFAULT;
  const stepped = Math.round(value / WIND_STREAK_DENSITY_STEP) / Math.round(1 / WIND_STREAK_DENSITY_STEP);
  return Math.min(WIND_STREAK_DENSITY_MAX, Math.max(WIND_STREAK_DENSITY_MIN, stepped));
}

export function windStreakDensityIsDefault(value: number): boolean {
  return clampWindStreakDensity(value) === WIND_STREAK_DENSITY_DEFAULT;
}

export function readStoredWindStreakDensity(storage: Storage): number {
  try {
    const raw = storage.getItem(WIND_STREAK_DENSITY_KEY);
    return raw == null ? WIND_STREAK_DENSITY_DEFAULT : clampWindStreakDensity(Number(raw));
  } catch {
    return WIND_STREAK_DENSITY_DEFAULT;
  }
}

export function writeStoredWindStreakDensity(storage: Storage, value: number): void {
  try {
    if (windStreakDensityIsDefault(value)) storage.removeItem(WIND_STREAK_DENSITY_KEY);
    else storage.setItem(WIND_STREAK_DENSITY_KEY, String(clampWindStreakDensity(value)));
  } catch {
  }
}

const listeners = new Set<() => void>();
let current: number | null = null;

function browserStorage(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}

export function getWindStreakDensity(): number {
  if (current == null) {
    const storage = browserStorage();
    current = storage ? readStoredWindStreakDensity(storage) : WIND_STREAK_DENSITY_DEFAULT;
  }
  return current;
}

export function setWindStreakDensity(value: number): void {
  const next = clampWindStreakDensity(value);
  const storage = browserStorage();
  if (storage) writeStoredWindStreakDensity(storage, next);
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function resetWindStreakDensityCache(): void {
  current = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWindStreakDensity(): number {
  return useSyncExternalStore(subscribe, getWindStreakDensity, () => WIND_STREAK_DENSITY_DEFAULT);
}
