import { describe, expect, it } from "vitest";
import { landingBuildingFill } from "./landingBuildingFill";
import type { BuildingFeat } from "../types";

const building = (use: BuildingFeat["use"]): BuildingFeat => ({
  id: 1,
  ring: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
  holes: [],
  height: 12,
  heightFromFallback: false,
  use,
  source: use === "unclassified" ? "none" : "osm_tag",
});

describe("landingBuildingFill", () => {
  it("uses the uniform token for unclassified buildings", () => {
    expect(landingBuildingFill(building("unclassified"))).toMatch(/^#/);
  });

  it("uses a use swatch for classified buildings", () => {
    const retail = landingBuildingFill(building("retail"));
    const residential = landingBuildingFill(building("residential"));
    expect(retail).not.toBe(residential);
  });
});
