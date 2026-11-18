import { describe, expect, it } from "vitest";
import type { Pt } from "../types";
import { pointInClip, windPlanSiteClip } from "./windPlanSiteClip";

const cut = { sideM: 200 };

function square(half: number, cx = 0, cy = 0): Pt[] {
  return [
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
    [cx - half, cy - half],
  ];
}

describe("windPlanSiteClip", () => {
  it("clips to the site parcel inside a larger cut", () => {
    const clip = windPlanSiteClip({ ...cut, siteBoundaryLines: [square(20)] });
    expect(clip.fallback).toBe("site");
    expect(clip.rings).toHaveLength(1);
    expect(pointInClip(0, 0, clip.rings)).toBe(true);
    expect(pointInClip(19, -19, clip.rings)).toBe(true);
    expect(pointInClip(50, 0, clip.rings)).toBe(false);
    expect(pointInClip(-90, 90, clip.rings)).toBe(false);
  });

  it("closes an open site polyline", () => {
    const open = square(20).slice(0, 4);
    const clip = windPlanSiteClip({ ...cut, siteBoundaryLines: [open] });
    expect(clip.fallback).toBe("site");
    expect(Array.from(clip.rings[0]!)).toEqual([-20, -20, 20, -20, 20, 20, -20, 20]);
    expect(pointInClip(0, 0, clip.rings)).toBe(true);
  });

  it("leaves holes and second parcels to the even-odd rule", () => {
    const clip = windPlanSiteClip({ ...cut, siteBoundaryLines: [square(40), square(10), square(10, 70, 70)] });
    expect(clip.rings).toHaveLength(3);
    expect(pointInClip(25, 0, clip.rings)).toBe(true);
    expect(pointInClip(0, 0, clip.rings)).toBe(false);
    expect(pointInClip(70, 70, clip.rings)).toBe(true);
  });

  it("falls back to the cut rectangle when there is no usable parcel", () => {
    for (const siteBoundaryLines of [undefined, [], [[[0, 0], [5, 5]] as Pt[]]]) {
      const clip = windPlanSiteClip({ ...cut, siteBoundaryLines });
      expect(clip.fallback).toBe("cut");
      expect(Array.from(clip.rings[0]!)).toEqual([-100, -100, 100, -100, 100, 100, -100, 100]);
      expect(pointInClip(0, 0, clip.rings)).toBe(true);
      expect(pointInClip(99, -99, clip.rings)).toBe(true);
      expect(pointInClip(101, 0, clip.rings)).toBe(false);
      expect(pointInClip(0, -150, clip.rings)).toBe(false);
    }
  });

  it("uses the cut's own width and height for a rectangular cut", () => {
    const clip = windPlanSiteClip({ sideM: 200, widthM: 300, heightM: 120 });
    expect(pointInClip(140, 0, clip.rings)).toBe(true);
    expect(pointInClip(0, 70, clip.rings)).toBe(false);
  });
});
