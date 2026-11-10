import { beforeEach, describe, expect, it } from "vitest";
import { clearPlanShadowCache } from "./buildingShadows";
import { createMassingBlock } from "./massingBlock";
import { massingBlocksToBuildingFeats } from "./massingBlockPlan";
import { computeSunHoursLostGrid, countPositiveLossCells } from "./sunHoursLostPlan";
import type { BuildingFeat, CityModel } from "../types";

const at = { lat: -37.8136, lon: 144.9631 };

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: at,
    sideM: 200,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

describe("sun hours lost plan grid", () => {
  beforeEach(() => clearPlanShadowCache());

  it("has no loss layer without proposed massing", () => {
    expect(computeSunHoursLostGrid(model([]), 2026, 3)).toBeNull();
  });

  it("finds positive loss south of a 6-storey L-shaped proposal", () => {
    const drawn = createMassingBlock(
      "cut-test",
      [
        [12, -6],
        [42, -6],
        [42, 8],
        [28, 8],
        [28, 32],
      ],
      { floors: 6, width_m: 14 },
    );
    const proposed = massingBlocksToBuildingFeats([drawn])[0]!;
    const grid = computeSunHoursLostGrid(model([proposed]), 2026, 3);
    expect(grid).not.toBeNull();
    expect(countPositiveLossCells(grid!)).toBeGreaterThan(8);
    expect(grid!.maxLoss).toBeGreaterThan(0.5);
  });
});
