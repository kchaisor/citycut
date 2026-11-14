import { describe, expect, it } from "vitest";
import {
  ambientOcclusionActive,
  readStoredRenderQuality,
  RENDER_QUALITY_KEY,
  studioAoActive,
  studioN8AoParams,
  studioSmaaActive,
  writeStoredRenderQuality,
} from "./renderQuality";

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("render quality", () => {
  it("defaults to high", () => {
    expect(readStoredRenderQuality(memoryStore())).toBe("high");
    expect(readStoredRenderQuality(memoryStore({ [RENDER_QUALITY_KEY]: "ultra" }))).toBe("high");
  });

  it("round-trips the stored choice", () => {
    const store = memoryStore();
    writeStoredRenderQuality(store, "fast");
    expect(readStoredRenderQuality(store)).toBe("fast");
    writeStoredRenderQuality(store, "high");
    expect(readStoredRenderQuality(store)).toBe("high");
  });

  it("keeps ambient occlusion on for high and off for fast", () => {
    expect(ambientOcclusionActive("high", false)).toBe(true);
    expect(ambientOcclusionActive("high", true)).toBe(true);
    expect(ambientOcclusionActive("fast", false)).toBe(false);
    expect(ambientOcclusionActive("fast", true)).toBe(false);
  });

  it("enables SMAA and AO only on high", () => {
    expect(studioSmaaActive("high")).toBe(true);
    expect(studioSmaaActive("fast")).toBe(false);
    expect(studioAoActive("high")).toBe(true);
    expect(studioAoActive("fast")).toBe(false);
  });

  it("uses softer N8AO in Primary view and keeps AO on while the camera moves", () => {
    const primary = studioN8AoParams(1000, true);
    const standard = studioN8AoParams(1000, false);
    expect(primary.intensity).toBeLessThan(standard.intensity);
    expect(primary.distanceFalloff).toBeLessThan(standard.distanceFalloff);
    expect(ambientOcclusionActive("high", true)).toBe(true);
  });
});
