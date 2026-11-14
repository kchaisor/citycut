import type { KeyValueStore } from "./view3dDisplay";

export type RenderQuality = "high" | "fast";

export const RENDER_QUALITY_KEY = "citycut.view3d.quality";

export const DEFAULT_RENDER_QUALITY: RenderQuality = "high";

export function readStoredRenderQuality(storage: KeyValueStore): RenderQuality {
  try {
    const stored = storage.getItem(RENDER_QUALITY_KEY);
    return stored === "fast" || stored === "high" ? stored : DEFAULT_RENDER_QUALITY;
  } catch {
    return DEFAULT_RENDER_QUALITY;
  }
}

export function writeStoredRenderQuality(storage: KeyValueStore, quality: RenderQuality): void {
  try {
    storage.setItem(RENDER_QUALITY_KEY, quality);
  } catch {
    return;
  }
}

export function ambientOcclusionActive(quality: RenderQuality, cameraMoving: boolean): boolean {
  if (quality !== "high") return false;
  if (typeof window !== "undefined" && window.__citycutPerfOverrides?.aoOffWhileMoving) {
    return !cameraMoving;
  }
  return true;
}

export function studioSmaaActive(quality: RenderQuality): boolean {
  return quality === "high";
}

export function studioAoActive(quality: RenderQuality): boolean {
  return quality === "high";
}

export type StudioN8AoParams = {
  aoRadius: number;
  distanceFalloff: number;
  intensity: number;
  aoSamples: number;
  denoiseSamples: number;
  denoiseRadius: number;
};

export function studioN8AoParams(sideM: number, primaryView: boolean): StudioN8AoParams {
  const baseRadius = Math.max(4, sideM * 0.012);
  if (primaryView) {
    return {
      aoRadius: Math.max(3, baseRadius * 0.82),
      distanceFalloff: 0.68,
      intensity: 1.38,
      aoSamples: 16,
      denoiseSamples: 6,
      denoiseRadius: 12,
    };
  }
  return {
    aoRadius: baseRadius,
    distanceFalloff: 1,
    intensity: 3.15,
    aoSamples: 14,
    denoiseSamples: 4,
    denoiseRadius: 10,
  };
}
