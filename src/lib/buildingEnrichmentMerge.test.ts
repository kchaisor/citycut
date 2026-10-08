import { describe, expect, it } from "vitest";
import { mergeBuildingEnrichment } from "./buildingEnrichmentMerge";
import type { BuildingFeat } from "../types";

describe("mergeBuildingEnrichment", () => {
  it("prefers CLUE over zone on the same footprint", () => {
    const building: BuildingFeat = {
      id: 1,
      overtureId: "abc",
      ring: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      holes: [],
      height: 9,
      use: "residential",
      source: "zone",
      zoneCode: "GRZ1",
    };
    const merged = mergeBuildingEnrichment(
      [building],
      new Map([
        [
          "abc",
          {
            overtureId: "abc",
            use: "commercial",
            useSource: "clue",
            heightM: null,
            heightSource: null,
            zoneCode: "GRZ1",
          },
        ],
      ]),
    );
    expect(merged[0]).toMatchObject({ use: "commercial", source: "clue", useSourceTier: "clue" });
  });
});
