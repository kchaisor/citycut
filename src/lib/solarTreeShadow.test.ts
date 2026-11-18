import { beforeEach, describe, expect, it } from "vitest";
import { clearPlanShadowCache } from "./buildingShadows";
import { createMassingBlock } from "./massingBlock";
import { massingBlocksToBuildingFeats } from "./massingBlockPlan";
import { assessSolarReceptor } from "./solarReceptorAssess";
import { computeSunHoursLostGrid, countPositiveLossCells } from "./sunHoursLostPlan";
import type { BuildingFeat, CityModel, Ring, TreeFeat } from "../types";

const at = { lat: -37.8136, lon: 144.9631 };

function model(buildings: BuildingFeat[], trees: TreeFeat[] = []): CityModel {
  return {
    placeLabel: "Test",
    center: at,
    sideM: 200,
    layers: { buildings: true, roads: false, waterGreen: false, trees: true },
    buildings,
    roads: [],
    areas: [],
    trees,
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

function tree(id: number, east: number, north: number): TreeFeat {
  return {
    id,
    at: [east, north],
    height_m: 12,
    crown_diameter_m: 8,
    trunk_diameter_m: 0.4,
    sizeSource: "default",
  };
}

describe("solar tree crown shadows", () => {
  beforeEach(() => clearPlanShadowCache());

  it("leaves B4-3 compliance unchanged when trees are present in the model", () => {
    const drawn = createMassingBlock("t", [[8, -6], [28, -6], [28, 10], [8, 10]], { floors: 6, width_m: 12 });
    const proposed = massingBlocksToBuildingFeats([drawn])[0]!;
    const m = model([proposed], [tree(1, 20, -18)]);
    const receptor = {
      id: "yard",
      kind: "yard" as const,
      ring: [
        [14, -30],
        [34, -30],
        [34, -16],
        [14, -16],
        [14, -30],
      ] as Ring,
    };
    const result = assessSolarReceptor(m, receptor, 2026);
    expect(result.assessKind).toBe("b43");
    expect(result.proposedPass).toBeDefined();
  });

  it("changes hours-lost cell count when tree shadows are included on the proposed side only", () => {
    const drawn = createMassingBlock("t", [[8, -6], [38, -6], [38, 10], [24, 10], [24, 34]], { floors: 6, width_m: 14 });
    const proposed = massingBlocksToBuildingFeats([drawn])[0]!;
    const m = model([proposed], [tree(1, 6, -22)]);
    const without = computeSunHoursLostGrid(m, 2026, 3, "off");
    const withTrees = computeSunHoursLostGrid(m, 2026, 3, "proposed-only");
    expect(without).not.toBeNull();
    expect(withTrees).not.toBeNull();
    expect(countPositiveLossCells(withTrees!)).not.toBe(countPositiveLossCells(without!));
  });
});
