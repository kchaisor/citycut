import { describe, expect, it } from "vitest";
import { rozelleViewportQaPasses, type RozelleViewportQa } from "./rozelleViewportQa";
import { getColour } from "./colours";

describe("rozelleViewportQaPasses", () => {
  it("accepts in-frame water and hides bridge cables in plan", () => {
    const audit: RozelleViewportQa = {
      projection: "plan",
      waterVisible: true,
      waterTriangleCount: 400,
      waterColorHex: getColour("--water-3d"),
      bridgeCablesVisible: false,
      bridgeCableSegmentCount: 12,
      storedEastMin: -480,
      storedEastMax: 420,
      storedNorthMin: -500,
      storedNorthMax: 480,
      frameHalfM: 500,
      harbourCutWaterZones: 2,
      terrainTriangleCount: 1000,
      terrainTrisBeforeCut: 1200,
      terrainTrisAfterCut: 1000,
      storedSiteTriangleCount: 800,
      waterEastMin: -200,
      waterEastMax: 100,
      waterNorthMin: 50,
      waterNorthMax: 300,
      osmWaterRingEastMin: -180,
      osmWaterRingEastMax: 120,
      osmWaterRingNorthMin: -80,
      osmWaterRingNorthMax: 220,
    };
    expect(rozelleViewportQaPasses(audit).ok).toBe(true);
  });
});