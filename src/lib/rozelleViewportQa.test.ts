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
    };
    expect(rozelleViewportQaPasses(audit).ok).toBe(true);
  });
});