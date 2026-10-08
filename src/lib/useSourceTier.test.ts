import { describe, expect, it } from "vitest";
import type { BuildingFeat } from "../types";
import {
  assertClassifiedBuildingsHaveSourceTier,
  resolveUseSourceTier,
  withResolvedUseSourceTiers,
} from "./useSourceTier";

function bare(
  partial: Partial<BuildingFeat> & Pick<BuildingFeat, "id" | "use" | "source">,
): BuildingFeat {
  return {
    ring: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
    holes: [],
    height: 9,
    ...partial,
  };
}

describe("useSourceTier", () => {
  it("maps Overture / OSM tag classification to overture tier", () => {
    const building = bare({ id: 1, use: "residential", source: "osm_tag" });
    expect(resolveUseSourceTier(building)).toBe("overture");
    expect(withResolvedUseSourceTiers([building])[0].useSourceTier).toBe("overture");
  });

  it("requires a non-unclassified tier whenever use is classified", () => {
    const buildings = [
      bare({ id: 1, use: "residential", source: "zone", useSourceTier: "zone" }),
      bare({ id: 2, use: "commercial", source: "osm_tag" }),
      bare({ id: 3, use: "unclassified", source: "none" }),
    ];
    assertClassifiedBuildingsHaveSourceTier(withResolvedUseSourceTiers(buildings));
  });
});
