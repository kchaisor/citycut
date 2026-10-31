import { describe, expect, it } from "vitest";
import {
  ambientOcclusionActive,
  readStoredRenderQuality,
  RENDER_QUALITY_KEY,
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

  it("keeps ambient occlusion off in fast and while the camera moves", () => {
    expect(ambientOcclusionActive("high", false)).toBe(true);
    expect(ambientOcclusionActive("high", true)).toBe(false);
    expect(ambientOcclusionActive("fast", false)).toBe(false);
    expect(ambientOcclusionActive("fast", true)).toBe(false);
  });
});
