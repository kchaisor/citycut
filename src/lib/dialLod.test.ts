import { describe, expect, it } from "vitest";
import {
  DIAL_LOD_MEDIUM_FULL_PX,
  DIAL_LOD_MINOR_FULL_PX,
  dialLodFade,
  dialPixelsPerDegree,
  dialTickLodOpacity,
} from "./dialLod";

describe("dialLod", () => {
  it("ramps opacity smoothly between thresholds", () => {
    expect(dialLodFade(0, 10, 20)).toBe(0);
    expect(dialLodFade(20, 10, 20)).toBe(1);
    const mid = dialLodFade(15, 10, 20);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it("returns full medium and minor opacity at high zoom", () => {
    const lod = dialTickLodOpacity(DIAL_LOD_MINOR_FULL_PX + 5);
    expect(lod.medium).toBe(1);
    expect(lod.minor).toBe(1);
    expect(lod.inner).toBe(1);
  });

  it("hides minor and medium ticks when zoomed out", () => {
    const lod = dialTickLodOpacity(0);
    expect(lod.medium).toBe(0);
    expect(lod.minor).toBe(0);
    expect(lod.inner).toBe(0);
  });

  it("shows medium ticks before minor ticks as zoom increases", () => {
    const mid = dialTickLodOpacity(DIAL_LOD_MEDIUM_FULL_PX);
    const low = dialTickLodOpacity(DIAL_LOD_MEDIUM_FULL_PX - 2);
    expect(mid.medium).toBe(1);
    expect(low.medium).toBeLessThan(1);
    expect(mid.minor).toBeLessThan(1);
  });

  it("measures pixel spacing along the ring from projected points", () => {
    const ortho = (x: number, _y: number, z: number) => ({ x: x / 500, y: z / 500 });
    const px = dialPixelsPerDegree(ortho, 1000, 800, 360, 0);
    expect(px).toBeGreaterThan(0.5);
    expect(Number.isFinite(px)).toBe(true);
  });
});
