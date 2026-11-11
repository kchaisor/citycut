import { beforeEach, describe, expect, it } from "vitest";
import { clearPlanShadowCache } from "./buildingShadows";
import { createMassingBlock } from "./massingBlock";
import { massingBlocksToBuildingFeats } from "./massingBlockPlan";
import { assessSolarReceptors } from "./solarReceptorAssess";
import { PARK_NO_ADDITIONAL_TOLERANCE_M2, solarRuleDefinition } from "./solarRuleRegistry";
import { parkAddedShadowRings, parkNoAdditionalPass, representativeParkStep } from "./solarParkAssess";
import { receptorAreaM2 } from "./solarAccessB43";
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

  it("returns the added-shadow hatch rings from the same step shadows it counted, inside the park", () => {
    const parkRing: Ring = [
      [-8, -34],
      [24, -34],
      [24, -12],
      [-8, -12],
      [-8, -34],
    ];
    const receptor = { id: "park-a", kind: "park" as const, ruleId: "melbourne-ddo10-yarra" as const, ring: [...parkRing] };
    const parkOnly = assessSolarReceptors(model([]), [receptor], 2026)[0]!;
    if (parkOnly.assessKind !== "park") throw new Error("expected park row");
    expect(parkOnly.addedShadowRings).toEqual([]);

    const drawn = createMassingBlock("park-hatch", [[8, -8], [38, -8], [38, 8]], { floors: 8, width_m: 14 });
    const row = assessSolarReceptors(model(massingBlocksToBuildingFeats([drawn])), [receptor], 2026)[0]!;
    if (row.assessKind !== "park") throw new Error("expected park row");
    expect(row.maxAddedM2).toBeGreaterThan(1);
    expect(row.addedShadowRings.length).toBeGreaterThan(0);
    const hatchM2 = row.addedShadowRings.reduce((sum, polygon) => sum + receptorAreaM2(polygon[0]!), 0);
    expect(hatchM2).toBeGreaterThan(row.maxAddedM2 * 0.5);
    expect(hatchM2).toBeLessThan(row.maxAddedM2 * 1.5 + 8);
    for (const [east, north] of row.addedShadowRings.flat(2)) {
      expect(east).toBeGreaterThanOrEqual(-8 - 1e-6);
      expect(east).toBeLessThanOrEqual(24 + 1e-6);
      expect(north).toBeGreaterThanOrEqual(-34 - 1e-6);
      expect(north).toBeLessThanOrEqual(-12 + 1e-6);
    }
    expect(JSON.parse(JSON.stringify(row)).addedShadowRings).toEqual(row.addedShadowRings);
  });

  it("falls back to the counted grid cells when polygon clipping yields nothing", () => {
    const parkRing: Ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const same = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]] as import("polygon-clipping").MultiPolygon;
    const rings = parkAddedShadowRings(parkRing, { existing: same, proposed: same }, [[3, 3], [5, 3]], 2);
    expect(rings).toEqual([
      [[[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]],
      [[[4, 2], [6, 2], [6, 4], [4, 4], [4, 2]]],
    ]);
    expect(parkAddedShadowRings(parkRing, { existing: [], proposed: same }, [], 2)).toEqual([]);
  });

  it("picks the step with maximum added area", () => {
    expect(
      representativeParkStep([
        { hour: 11, minute: 0, addedM2: 2 },
        { hour: 12, minute: 0, addedM2: 80 },
        { hour: 13, minute: 0, addedM2: 10 },
      ]),
    ).toBe(1);
    expect(representativeParkStep([{ hour: 12, minute: 0, addedM2: 0 }])).toBe(-1);
  });
});
