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
});
