import { describe, expect, it } from "vitest";
import { BUILDING_USE_META, SOURCE_META } from "./buildingUse";
import { buildingViewportFill, parseBuildingBucketName } from "./buildingViewportColor";
import { uniformBuildingColor } from "./buildingUse";

describe("buildingViewportColor", () => {
  it("returns use colour by default", () => {
    expect(
      buildingViewportFill({ colourByUse: true, uniformBuildings: false, colourBySource: false }, "retail", undefined),
    ).toBe(BUILDING_USE_META.retail.color);
  });

  it("returns uniform grey when uniform mode is on", () => {
    expect(
      buildingViewportFill({ colourByUse: false, uniformBuildings: true, colourBySource: false }, "retail", undefined),
    ).toBe(uniformBuildingColor());
  });

  it("returns source colour when colouring by source", () => {
    expect(
      buildingViewportFill({ colourByUse: true, uniformBuildings: false, colourBySource: true }, undefined, "zone"),
    ).toBe(SOURCE_META.zone.color);
  });

  it("parses bucket names", () => {
    expect(parseBuildingBucketName("Buildings::Retail").use).toBe("retail");
    expect(parseBuildingBucketName("source:osm")).toEqual({ sourceKey: "osm" });
  });
});
