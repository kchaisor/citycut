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
  return quality === "high" && !cameraMoving;
}
