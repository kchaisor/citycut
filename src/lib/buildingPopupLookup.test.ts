import { describe, expect, it } from "vitest";
import type { BuildingFeat } from "../types";
import { fromLocal } from "./geo";
import { interiorPoint } from "./useCascade";
import { damRecordsWonByBuilding, type DamFloorRecord } from "./comDevelopmentFloors";
const center = { lon: 144.98, lat: -37.812 };

function building(id: number, ring: BuildingFeat["ring"], extra: Partial<BuildingFeat> = {}): BuildingFeat {
  return {
    id,
    ring,
    holes: [],
    height: 3,
    heightFromFallback: true,
    use: "recreation",
    source: "zone",
    ...extra,
  };
}

describe("building popup DAM display", () => {
  it("only shows development when this building won the DAM footprint assignment", async () => {
    const park = building(2809555828, [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ]);
    const tower = building(99, [
      [50, 0],
      [100, 0],
      [100, 50],
      [50, 50],
      [50, 0],
    ], { height: 9, use: "residential", heightFromFallback: true });
    const all = [park, tower];
    const towerAt = interiorPoint(tower.ring, tower.holes);
    const { lon, lat } = fromLocal(towerAt, center);
    const damAtTower: DamFloorRecord = { lon, lat, floorsAbove: 33 };
    expect(damRecordsWonByBuilding(park, center, [damAtTower], all).length).toBe(0);
    expect(damRecordsWonByBuilding(tower, center, [damAtTower], all).length).toBe(1);
  });
});
