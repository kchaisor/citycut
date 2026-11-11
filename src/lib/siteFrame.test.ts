import { describe, expect, it } from "vitest";
import {
  clipPolygonSiteFrame,
  pointInSiteFrame,
  readSiteFrameShape,
  siteFrameAreaM2,
} from "./siteFrame";

describe("siteFrame", () => {
  it("reads shape=circle from the URL and defaults to square", () => {
    expect(readSiteFrameShape(null)).toBe("square");
    expect(readSiteFrameShape("circle")).toBe("circle");
    expect(readSiteFrameShape("a3")).toBe("a3");
    expect(readSiteFrameShape("Square")).toBe("square");
  });

  it("clips corners outside a circle but keeps the centre", () => {
    const square: import("../types").Ring = [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
      [-50, -50],
    ];
    const clipped = clipPolygonSiteFrame(square, 100, "circle");
    expect(clipped.length).toBeGreaterThan(3);
    expect(pointInSiteFrame([45, 45], 100, "circle")).toBe(false);
    expect(pointInSiteFrame([10, 10], 100, "circle")).toBe(true);
  });

  it("reports circular area from diameter km", () => {
    expect(siteFrameAreaM2(1000, "square")).toBe(1_000_000);
    expect(siteFrameAreaM2(1000, "circle")).toBeCloseTo(Math.PI * 500 ** 2, 0);
  });

  it("clips polygons to an A3 landscape rectangle", () => {
    const wide: import("../types").Ring = [
      [-700, -200],
      [700, -200],
      [700, 200],
      [-700, 200],
      [-700, -200],
    ];
    const clipped = clipPolygonSiteFrame(wide, 1260, "a3", { widthM: 1260, heightM: 891 });
    const xs = clipped.map((p) => p[0]);
    const ys = clipped.map((p) => p[1]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(630.01);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-630.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(445.51);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-445.51);
    expect(pointInSiteFrame([600, 446], 1260, "a3", { widthM: 1260, heightM: 891 })).toBe(false);
    expect(pointInSiteFrame([600, 200], 1260, "a3", { widthM: 1260, heightM: 891 })).toBe(true);
  });
});
