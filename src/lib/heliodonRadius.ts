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

export const SUN_DOME_RADIUS_MIN_M = 120;
export const SUN_DOME_RADIUS_MAX_M = 350;
export const SUN_DOME_HALF_DIAGONAL_FACTOR = 0.6;

export function sunDomeRadiusM(sideM: number): number {
  const raw = SUN_DOME_HALF_DIAGONAL_FACTOR * Math.hypot(sideM / 2, sideM / 2);
  return Math.min(SUN_DOME_RADIUS_MAX_M, Math.max(SUN_DOME_RADIUS_MIN_M, raw));
}

export const SUN_DOME_SIZE_MIN_FACTOR = 0.5;
export const SUN_DOME_SIZE_SNAP_SHARE = 0.015;

export type SunDomeCut = { sideM: number; widthM?: number; heightM?: number };
export type SunDomeRange = { minM: number; autoM: number; maxM: number };

export function sunDomeRange(cut: SunDomeCut): SunDomeRange {
  const autoM = sunDomeRadiusM(cut.sideM);
  const cutEdgeM = Math.hypot((cut.widthM ?? cut.sideM) / 2, (cut.heightM ?? cut.sideM) / 2);
  return { minM: autoM * SUN_DOME_SIZE_MIN_FACTOR, autoM, maxM: Math.max(autoM, cutEdgeM) };
}

export function resolveSunDomeRadiusM(range: SunDomeRange, chosenM: number | null | undefined): number {
  if (chosenM == null || !Number.isFinite(chosenM)) return range.autoM;
  return Math.min(range.maxM, Math.max(range.minM, chosenM));
}

export function sunDomeSizeFromSlider(range: SunDomeRange, valueM: number): number | null {
  const radiusM = resolveSunDomeRadiusM(range, valueM);
  return Math.abs(radiusM - range.autoM) <= (range.maxM - range.minM) * SUN_DOME_SIZE_SNAP_SHARE ? null : radiusM;
}

export function sunDomeSizeShare(range: SunDomeRange, radiusM: number): number {
  const span = range.maxM - range.minM;
  return span > 0 ? (resolveSunDomeRadiusM(range, radiusM) - range.minM) / span : 0;
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
  }
}

export function heliodonRadiusFromSearch(search: string): number | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return parseHeliodonRadiusFactor(params.get("heliodon"));
}

export function resolveHeliodonRadiusFactor(stored: number, search: string): number {
  const fromUrl = heliodonRadiusFromSearch(search);
  return fromUrl ?? clampHeliodonRadiusFactor(stored);
}
