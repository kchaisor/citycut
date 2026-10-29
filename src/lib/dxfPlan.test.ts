import { describe, expect, it } from "vitest";
import { sitePlanDxf } from "./dxfPlan";
import type { CityModel } from "../types";

function model(buildings: CityModel["buildings"]): CityModel {
  return {
    placeLabel: "Test",
    center: { lat: -37.8136, lon: 144.9631 },
    sideM: 400,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
  } as unknown as CityModel;
}

describe("sitePlanDxf", () => {
  it("writes CC_Height_* layers when height reliability export is on", () => {
    const text = sitePlanDxf(
      model([
        {
          id: 1,
          ring: [
            [0, 0],
            [20, 0],
            [20, 20],
            [0, 20],
            [0, 0],
          ],
          holes: [],
          height: 12,
          use: "residential",
          source: "none",
          heightTier: "com",
        },
        {
          id: 2,
          ring: [
            [40, 0],
            [60, 0],
            [60, 20],
            [40, 20],
            [40, 0],
          ],
          holes: [],
          height: 9,
          use: "civic",
          source: "none",
          heightTier: "zone_default",
          heightFromFallback: true,
        },
      ]),
      1000,
      undefined,
      { colourByHeightReliability: true },
    );
    expect(text).toContain("CC_Height_Surveyed");
    expect(text).toContain("CC_Height_Estimated");
    expect(text).not.toContain("\n  8\nBuildings\n");
  });
});
