import { describe, expect, it } from "vitest";
import { fillForTileUse, landingBuildingFill } from "./landingBuildingFill";
import { BUILDING_USE_META } from "./buildingUse";
import { getColour } from "./colours";
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

  it("matches tile expression for unclassified (grey, not uniform white)", () => {
    expect(fillForTileUse("unclassified")).toBe(BUILDING_USE_META.unclassified.color);
    expect(fillForTileUse("unclassified")).not.toBe(getColour("--building-uniform"));
    expect(landingBuildingFill(building("unclassified"))).toBe(getColour("--building-uniform"));
  });

  it("uses a use swatch for classified buildings", () => {
    const retail = landingBuildingFill(building("retail"));
    const residential = landingBuildingFill(building("residential"));
    expect(retail).not.toBe(residential);
  });
});
