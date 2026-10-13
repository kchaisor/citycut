import { describe, expect, it } from "vitest";
import { mgaGridStep, MGA_GRID_MIN_GAP_PX } from "./mgaGrid";
import { projectLonLat } from "./crs";

describe("MGA grid step", () => {
  it("picks the finest readable step as the map zooms", () => {
    expect(mgaGridStep(0.1)).toBe(10);
    expect(mgaGridStep(0.25)).toBe(50);
    expect(mgaGridStep(1)).toBe(100);
    expect(mgaGridStep(3)).toBe(500);
    expect(mgaGridStep(10)).toBe(1000);
    expect(mgaGridStep(40)).toBe(5000);
    for (const mpp of [0.3, 1, 3, 9, 27, 81]) expect(mgaGridStep(mpp) / mpp).toBeGreaterThanOrEqual(MGA_GRID_MIN_GAP_PX);
  });
});

describe("MGA grid crosses", async () => {
  const { mgaGridCrosses } = await import("./mgaGrid");
  it("puts one cross on every whole-step easting × northing intersection in view", () => {
    const crosses = mgaGridCrosses({ west: 144.97, south: -37.82, east: 144.99, north: -37.81 }, 500);
    expect(crosses.length).toBeGreaterThan(4);
    for (const c of crosses) {
      expect(c.easting % 500).toBe(0);
      expect(c.northing % 500).toBe(0);
      const [e, n] = projectLonLat(c.lon, c.lat, 55);
      expect(Math.abs(e - c.easting)).toBeLessThan(0.01);
      expect(Math.abs(n - c.northing)).toBeLessThan(0.01);
    }
  });
  it("gives up rather than drawing thousands of crosses", () => {
    expect(mgaGridCrosses({ west: 140, south: -39, east: 150, north: -35 }, 50)).toEqual([]);
  });
});
