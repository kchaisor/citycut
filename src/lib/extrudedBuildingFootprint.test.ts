import { describe, expect, it } from "vitest";
import { computeSunHoursGroundGrid } from "./sunHoursGroundPlan";
import { sunHoursGroundRgba } from "./sunHoursGround";
import {
  extrudedFootprintsForBuilding,
  planPointUnderExtrudedBuildingRoof,
} from "./extrudedBuildingFootprint";
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

function cellRgbaAt(
  grid: NonNullable<ReturnType<typeof computeSunHoursGroundGrid>>,
  col: number,
  row: number,
  maxHours: number,
): [number, number, number, number] {
  const index = row * grid.cols + col;
  return sunHoursGroundRgba(grid.sunHours[index]!, maxHours, Boolean(grid.masked[index]));
}

describe("extrudedBuildingFootprint ground mask", () => {
  it("keeps yards coloured when the catalog footprint is larger than the extruded mesh", () => {
    const small: BuildingFeat["ring"] = [
      [-4, -4],
      [4, -4],
      [4, 4],
      [-4, 4],
      [-4, -4],
    ];
    const yardInsideShell: BuildingFeat = {
      id: 1,
      ring: [
        [-30, -30],
        [30, -30],
        [30, 30],
        [-30, 30],
        [-30, -30],
      ],
      holes: [],
      height: 10,
      use: "residential",
      source: "none",
      extrusionParts: [{ ring: small, holes: [], height: 10 }],
    };
    const city = model([yardInsideShell]);
    expect(extrudedFootprintsForBuilding(yardInsideShell).length).toBe(1);
    expect(planPointUnderExtrudedBuildingRoof(city.buildings, 20, 20)).toBe(false);
    expect(planPointUnderExtrudedBuildingRoof(city.buildings, 0, 0)).toBe(true);
    const grid = computeSunHoursGroundGrid(city, 2026, 6, 21);
    expect(grid).not.toBeNull();
    const yardCol = Math.floor((20 - grid!.originEast) / grid!.cellM);
    const yardRow = Math.floor((20 - grid!.originNorth) / grid!.cellM);
    expect(grid!.masked[yardRow * grid!.cols + yardCol]).toBe(0);
    const rgba = cellRgbaAt(grid!, yardCol, yardRow, grid!.maxSunHours);
    expect(rgba[3]).toBeGreaterThan(0);
  });

  it("never leaves open ground transparent for zero-height or meshDrawnBy footprints", () => {
    const extruded: BuildingFeat = {
      id: 1,
      ring: [
        [-12, -12],
        [12, -12],
        [12, 12],
        [-12, 12],
        [-12, -12],
      ],
      holes: [],
      height: 9,
      use: "residential",
      source: "none",
    };
    const zeroHeightYard: BuildingFeat = {
      id: 2,
      ring: [
        [20, -8],
        [35, -8],
        [35, 8],
        [20, 8],
        [20, -8],
      ],
      holes: [],
      height: 0,
      use: "residential",
      source: "none",
    };
    const absorbed: BuildingFeat = {
      id: 3,
      ring: [
        [-35, 20],
        [-20, 20],
        [-20, 35],
        [-35, 35],
        [-35, 20],
      ],
      holes: [],
      height: 6,
      use: "residential",
      source: "none",
      meshDrawnBy: 1,
    };
    const city = model([extruded, zeroHeightYard, absorbed]);
    const grid = computeSunHoursGroundGrid(city, 2026, 6, 21);
    expect(grid).not.toBeNull();
    const maxHours = Math.max(grid!.maxSunHours, 0.01);
    const openPoints: [number, number][] = [
      [27, 0],
      [-27, 27],
    ];
    for (const [east, north] of openPoints) {
      const col = Math.floor((east - grid!.originEast) / grid!.cellM);
      const row = Math.floor((north - grid!.originNorth) / grid!.cellM);
      expect(grid!.masked[row * grid!.cols + col]).toBe(0);
      expect(cellRgbaAt(grid!, col, row, maxHours)[3]).toBeGreaterThan(0);
    }
    const roofCol = Math.floor((0 - grid!.originEast) / grid!.cellM);
    const roofRow = Math.floor((0 - grid!.originNorth) / grid!.cellM);
    expect(grid!.masked[roofRow * grid!.cols + roofCol]).toBe(1);
    expect(cellRgbaAt(grid!, roofCol, roofRow, maxHours)[3]).toBe(0);
  });
});
