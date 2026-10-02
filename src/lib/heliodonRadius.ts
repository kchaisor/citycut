/** Heliodon horizon-ring radius as a multiple of the site half-width (sideM / 2). */
export const HELIODON_RADIUS_FACTOR_MIN = 0.75;
export const HELIODON_RADIUS_FACTOR_MAX = 3;
export const HELIODON_RADIUS_FACTOR_DEFAULT = 1.75;

export const HELIODON_RADIUS_STORAGE_KEY = "citycut.heliodonRadius";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function heliodonRadiusM(sideM: number, factor: number): number {
  return (sideM / 2) * factor;
}

export function clampHeliodonRadiusFactor(value: number): number {
  if (!Number.isFinite(value)) return HELIODON_RADIUS_FACTOR_DEFAULT;
  return Math.min(HELIODON_RADIUS_FACTOR_MAX, Math.max(HELIODON_RADIUS_FACTOR_MIN, value));
}

export function parseHeliodonRadiusFactor(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return clampHeliodonRadiusFactor(value);
}

export function readStoredHeliodonRadiusFactor(storage: KeyValueStore): number {
  try {
    const parsed = parseHeliodonRadiusFactor(storage.getItem(HELIODON_RADIUS_STORAGE_KEY));
    return parsed ?? HELIODON_RADIUS_FACTOR_DEFAULT;
  } catch {
    return HELIODON_RADIUS_FACTOR_DEFAULT;
  }
}

export function writeStoredHeliodonRadiusFactor(storage: KeyValueStore, factor: number): void {
  try {
    storage.setItem(HELIODON_RADIUS_STORAGE_KEY, String(clampHeliodonRadiusFactor(factor)));
  } catch {
    // Private mode can reject localStorage.
  }
}

/** Optional `heliodon=1.75` query param (site half-extent multiplier). */
export function heliodonRadiusFromSearch(search: string): number | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return parseHeliodonRadiusFactor(params.get("heliodon"));
}

export function resolveHeliodonRadiusFactor(stored: number, search: string): number {
  const fromUrl = heliodonRadiusFromSearch(search);
  return fromUrl ?? clampHeliodonRadiusFactor(stored);
}
