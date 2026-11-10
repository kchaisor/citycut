import { beforeEach, describe, expect, it } from "vitest";
import { clearPlanShadowCache } from "./buildingShadows";
import { createMassingBlock } from "./massingBlock";
import { massingBlocksToBuildingFeats } from "./massingBlockPlan";
import { parkAddedShadowClipRings, representativeParkStep } from "./solarParkPlanOverlay";
import { assessSolarParkReceptor } from "./solarParkAssess";
import type { BuildingFeat, CityModel, Ring } from "../types";

function tower(at: [number, number], heightFloors: number): BuildingFeat[] {
  const [east, north] = at;
  const block = createMassingBlock(
    `tower-${east}`,
    [
      [east - 8, north - 8],
      [east + 8, north - 8],
      [east + 8, north + 8],
      [east - 8, north + 8],
    ],
    { floors: heightFloors, width_m: 14 },
  );
  return massingBlocksToBuildingFeats([block]);
}

const parkRing: Ring = [
  [0, 0],
  [40, 0],
  [40, 30],
  [0, 30],
  [0, 0],
];

function baseModel(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: { lat: -37.81, lon: 144.97 },
    sideM: 400,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

describe("park plan overlay", () => {
  beforeEach(() => clearPlanShadowCache());
  it("picks the step with maximum added area", () => {
    const step = representativeParkStep([
      { hour: 11, minute: 0, addedM2: 2 },
      { hour: 12, minute: 0, addedM2: 80 },
      { hour: 13, minute: 0, addedM2: 10 },
    ]);
    expect(step).toEqual({ hour: 12, minute: 0 });
  });

  it("returns hatch rings when proposal adds shadow on the park", () => {
    const model = baseModel(tower([50, 15], 12));
    const receptor = { id: "park-a", kind: "park" as const, ruleId: "melbourne-cl22-park" as const, ring: parkRing };
    const row = assessSolarParkReceptor(model, receptor, 2026, 2)!;
    expect(row.pass).toBe(false);
    const rings = parkAddedShadowClipRings(
      model,
      parkRing,
      "melbourne-cl22-park",
      2026,
      row.stepAddedM2.reduce((best, s) => (s.addedM2 > best.addedM2 ? s : best)).hour,
      0,
    );
    expect(rings.length).toBeGreaterThan(0);
    expect(rings[0]![0]!.length).toBeGreaterThan(3);
  });
});
