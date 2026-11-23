export type SunHoursProgressCallback = (fraction: number) => void;

export const SUN_HOURS_GROUND_PROGRESS_SHARE = 0.65;

export function clampSunHoursProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function sunHoursProgressPercent(progress: number): string {
  return `${Math.round(clampSunHoursProgress(progress) * 100)}%`;
}

export function sunHoursLegendBusy(pending: boolean, pendingSurfaces: boolean): boolean {
  return pending || pendingSurfaces;
}

export function combineSunHoursProgress(
  groundFraction: number | null,
  surfaceFraction: number | null,
  phase: "ground" | "surfaces",
): number | null {
  if (phase === "ground") {
    if (groundFraction == null) return null;
    return clampSunHoursProgress(groundFraction * SUN_HOURS_GROUND_PROGRESS_SHARE);
  }
  const surface = surfaceFraction == null ? 0 : clampSunHoursProgress(surfaceFraction);
  return clampSunHoursProgress(SUN_HOURS_GROUND_PROGRESS_SHARE + surface * (1 - SUN_HOURS_GROUND_PROGRESS_SHARE));
}

export function reportSunHoursStep(
  onProgress: SunHoursProgressCallback | undefined,
  done: number,
  total: number,
  start = 0,
  end = 1,
): void {
  if (!onProgress || total <= 0) return;
  onProgress(start + (done / total) * (end - start));
}

export function createThrottledProgress(
  emit: SunHoursProgressCallback,
  minDelta = 0.02,
  minMs = 80,
): SunHoursProgressCallback {
  let last = -1;
  let lastAt = 0;
  return (fraction: number) => {
    const value = clampSunHoursProgress(fraction);
    const now = Date.now();
    if (value < 1 && value - last < minDelta && now - lastAt < minMs) return;
    last = value;
    lastAt = now;
    emit(value);
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
