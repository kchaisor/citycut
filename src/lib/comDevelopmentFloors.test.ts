import { describe, expect, it } from "vitest";
import type { BuildingFeat, Ring } from "../types";
import {
  applyDevelopmentFloorsToBuildings,
  applyDevelopmentFloorsToBuildingsLegacy,
  countDamMultiBuildingAssignments,
  type DamFloorRecord,
} from "./comDevelopmentFloors";

const record: DamFloorRecord = { lon: 144.98061, lat: -37.8127, floorsAbove: 9 };
const center = { lon: record.lon, lat: record.lat };

function box(id: number, x: number, y: number, w: number, areaScale = 1): BuildingFeat {
  const ring: Ring = [
    [x, y],
    [x + w * areaScale, y],
    [x + w * areaScale, y + w],
    [x, y + w],
    [x, y],
  ];
  return {
    id,
    ring,
    holes: [],
    height: 6,
    heightFromFallback: true,
    use: "civic",
    source: "zone",
  };
}

describe("DAM floor assignment", () => {
  it("assigns one winner per DAM record (largest eligible footprint)", () => {
    const small = box(1, 0, 0, 10);
    const large = box(2, 0, 0, 30);
    const out = applyDevelopmentFloorsToBuildings([small, large], center, [record]);
    expect(out.find((b) => b.id === 2)?.height).toBe(27);
    expect(out.find((b) => b.id === 1)?.height).toBe(6);
  });

  it("reports fewer multi-building DAM hits after winner rule", () => {
    const buildings = [box(1, 0, 0, 10), box(2, 5, 5, 25), box(3, 8, 8, 12)];
    const legacy = countDamMultiBuildingAssignments(buildings, center, [record], "legacy");
    const winner = countDamMultiBuildingAssignments(buildings, center, [record], "winner");
    expect(legacy.recordsWithMultipleBuildings).toBeGreaterThan(0);
    expect(winner.recordsWithMultipleBuildings).toBe(0);
  });

  it("legacy mode over-assigns the same floors to neighbours", () => {
    const buildings = [box(1, 0, 0, 10), box(2, 2, 2, 20)];
    const legacy = applyDevelopmentFloorsToBuildingsLegacy(buildings, center, [record]);
    expect(legacy.every((b) => b.height === 27)).toBe(true);
  });
});
