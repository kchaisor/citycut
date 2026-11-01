import { describe, expect, it } from "vitest";
import { buildingHudFloorField } from "./semanticHudGeometry";
import type { BuildingFeat } from "../types";

function building(partial: Partial<BuildingFeat>): BuildingFeat {
  return {
    id: 1,
    ring: [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ],
    holes: [],
    height: 13.5,
    use: "commercial",
    source: "overture_class",
    heightTier: "overture_height",
    numFloors: 15,
    ...partial,
  };
}

describe("buildingHudFloorField", () => {
  it("flags conflict when num_floors implies a different height than the scalar", () => {
    const field = buildingHudFloorField(building({ height: 13.5, numFloors: 15, heightTier: "overture_height" }));
    expect(field.floors).toBe(15);
    expect(field.conflictNote).toMatch(/13\.5 m/);
    expect(field.gfaFromHeight).toBe(true);
    expect(field.gfaFloors).toBe(Math.round(13.5 / 3));
  });
});
