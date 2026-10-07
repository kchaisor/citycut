import { describe, expect, it } from "vitest";
import { landingViewportFootprint } from "./landingMapViewport";

describe("landingViewportFootprint", () => {
  it("expands the viewport by 25% and covers it with a square sideM", () => {
    const bounds = { south: -37.82, west: 144.95, north: -37.81, east: 144.97 };
    const footprint = landingViewportFootprint(bounds, 15);
    expect(footprint.bounds.north - footprint.bounds.south).toBeCloseTo((bounds.north - bounds.south) * 1.25, 5);
    expect(footprint.bounds.east - footprint.bounds.west).toBeCloseTo((bounds.east - bounds.west) * 1.25, 5);
    expect(footprint.sideM).toBeGreaterThan(800);
    expect(footprint.cacheKey).toContain("15.00");
  });
});
