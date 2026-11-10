import { describe, expect, it } from "vitest";
import { treeCrownShadowRing } from "./solarTreePlanShadow";

describe("tree crown plan shadow", () => {
  it("returns an ellipse ring for a midday September sample", () => {
    const ring = treeCrownShadowRing(
      {
        id: 1,
        at: [0, 0],
        height_m: 10,
        crown_diameter_m: 6,
        trunk_diameter_m: 0.3,
        sizeSource: "default",
      },
      { lat: -37.81, lon: 144.96, year: 2026, month: 9, day: 22, hour: 12, minute: 0 },
    );
    expect(ring?.length).toBeGreaterThan(8);
  });
});
