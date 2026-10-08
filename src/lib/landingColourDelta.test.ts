import { describe, expect, it } from "vitest";
import { BUILDING_USE_META } from "./buildingUse";
import { landingLiveColourBuildings, needsLiveColourOverlay } from "./landingColourDelta";
import type { BuildingEnrichmentRecord } from "./buildingEnrichmentTiles";
import type { BuildingFeat } from "../types";
import { getColour } from "./colours";

const base: BuildingFeat = {
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
  source: "overture_class",
  useSourceTier: "overture",
};

describe("landingColourDelta", () => {
  it("skips overlay when live use matches enrichment tile", () => {
    const byId = new Map<string, BuildingEnrichmentRecord>([
      [
        "abc",
        {
          overtureId: "abc",
          use: "residential",
          useSource: "overture",
          heightM: null,
          heightSource: null,
          zoneCode: null,
        },
      ],
    ]);
    expect(needsLiveColourOverlay(base, byId)).toBe(false);
    expect(landingLiveColourBuildings([base], byId)).toEqual([]);
  });

  it("overlays when live refine beats tile", () => {
    const building: BuildingFeat = { ...base, use: "commercial", source: "clue", useSourceTier: "clue" };
    const byId = new Map<string, BuildingEnrichmentRecord>([
      [
        "abc",
        {
          overtureId: "abc",
          use: "residential",
          useSource: "overture",
          heightM: null,
          heightSource: null,
          zoneCode: null,
        },
      ],
    ]);
    expect(needsLiveColourOverlay(building, byId)).toBe(true);
  });

  it("overlays when tile paints unclassified grey but live refine is uniform white", () => {
    const building: BuildingFeat = { ...base, use: "unclassified", source: "none" };
    const byId = new Map<string, BuildingEnrichmentRecord>([
      [
        "abc",
        {
          overtureId: "abc",
          use: "unclassified",
          useSource: "unclassified",
          heightM: null,
          heightSource: null,
          zoneCode: null,
        },
      ],
    ]);
    expect(BUILDING_USE_META.unclassified.color).not.toBe(getColour("--building-uniform"));
    expect(needsLiveColourOverlay(building, byId)).toBe(true);
  });

});
