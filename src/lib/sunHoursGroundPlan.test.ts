import { describe, expect, it } from "vitest";
import { computeSunHoursGroundGrid, footprintMaskedCells, countSunHoursGroundCells } from "./sunHoursGroundPlan";
import type { BuildingFeat, CityModel } from "../types";

const at = { lat: -37.8136, lon: 144.9631 };

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: at,
    sideM: 120,
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

describe("computeSunHoursGroundGrid", () => {
  it("covers the site grid and masks footprints", () => {
    const building: BuildingFeat = {
      id: 1,
      ring: [
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10],
        [-10, -10],
      ],
      holes: [],
      height: 24,
      use: "commercial",
      source: "none",
    };
    const grid = computeSunHoursGroundGrid(model([building]), 2026, 6, 21);
    expect(grid).not.toBeNull();
    expect(grid!.cellM).toBe(3);
    expect(grid!.cols).toBeGreaterThan(10);
    expect(grid!.maxSunHours).toBeGreaterThan(0);
    expect(footprintMaskedCells(grid!)).toBeGreaterThan(0);
    expect(countSunHoursGroundCells(grid!)).toBeGreaterThan(10);
  });
});
