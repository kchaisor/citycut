import { beforeEach, describe, expect, it } from "vitest";
import { clearPlanShadowCache } from "./buildingShadows";
import { createMassingBlock } from "./massingBlock";
import { massingBlocksToBuildingFeats } from "./massingBlockPlan";
import { assessSolarReceptors } from "./solarReceptorAssess";
import { PARK_NO_ADDITIONAL_TOLERANCE_M2, solarRuleDefinition } from "./solarRuleRegistry";
import { parkNoAdditionalPass } from "./solarParkAssess";
import type { BuildingFeat, CityModel, Ring } from "../types";

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

describe("park noAdditional assess", () => {
  beforeEach(() => clearPlanShadowCache());

  it("passes tolerance helper at zero and fails above", () => {
    expect(parkNoAdditionalPass(0)).toBe(true);
    expect(parkNoAdditionalPass(PARK_NO_ADDITIONAL_TOLERANCE_M2)).toBe(true);
    expect(parkNoAdditionalPass(PARK_NO_ADDITIONAL_TOLERANCE_M2 + 1)).toBe(false);
  });

  it("passes with no proposed massing and fails when a tower adds park shadow", () => {
    const parkRing: Ring = [
      [-8, -34],
      [24, -34],
      [24, -12],
      [-8, -12],
      [-8, -34],
    ];
    const parkOnly = assessSolarReceptors(
      model([]),
      [{ id: "park-a", kind: "park", ruleId: "melbourne-ddo10-yarra", ring: [...parkRing] }],
      2026,
    )[0]!;
    expect(parkOnly.assessKind).toBe("park");
    if (parkOnly.assessKind !== "park") return;
    expect(parkOnly.pass).toBe(true);

    const drawn = createMassingBlock(
      "park-test",
      [
        [8, -8],
        [38, -8],
        [38, 8],
      ],
      { floors: 8, width_m: 14 },
    );
    const proposed = massingBlocksToBuildingFeats([drawn])[0]!;
    const withTower = assessSolarReceptors(
      model([proposed]),
      [{ id: "park-a", kind: "park", ruleId: "melbourne-ddo10-yarra", ring: [...parkRing] }],
      2026,
    )[0]!;
    expect(withTower.assessKind).toBe("park");
    if (withTower.assessKind !== "park") return;
    expect(withTower.maxAddedM2).toBeGreaterThan(1);
    expect(withTower.pass).toBe(false);
    expect(withTower.stepAddedM2.some((step) => step.addedM2 > 0)).toBe(true);
    expect(solarRuleDefinition(withTower.ruleId).kind).toBe("noAdditional");
  });
});
