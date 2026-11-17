import { describe, expect, it } from "vitest";
import {
  buildGroundWindGrid,
  groundWindIsSolid,
  rasterGroundWindObstacles,
  sampleGroundWindFlow,
  type GroundWindFlowGrid,
} from "./groundWindField";
import { windObstacleModel } from "./windObstacleModel";
import type { BuildingFeat, CityModel, Pt, TreeFeat } from "../types";

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function building(id: number, footprint: Pt[], height: number): BuildingFeat {
  return { id, ring: footprint, holes: [], height, use: "residential", source: "osm_tag" };
}

function imported(id: number, footprint: Pt[], height: number): BuildingFeat {
  return { ...building(id, footprint, height), importedMassing: true };
}

function tree(id: number, at: Pt, crown = 6): TreeFeat {
  return { id, at, height_m: 8, crown_diameter_m: crown, trunk_diameter_m: 0.4, sizeSource: "default" };
}

function modelWith(buildings: BuildingFeat[], trees: TreeFeat[] = [], sideM = 240): CityModel {
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings,
    roads: [],
    areas: [],
    trees,
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

const NORTH_SECTOR = 0;

function speedAt(grid: GroundWindFlowGrid, east: number, north: number): number {
  return sampleGroundWindFlow(grid, east, north, { east: 0, north: 0, speed: 0 }).speed;
}

describe("windObstacleModel", () => {
  it("makes an imported block solid", () => {
    const base = modelWith([building(1, ring(60, 60, 80, 80), 9)]);
    expect(groundWindIsSolid(rasterGroundWindObstacles(base), 0, 0)).toBe(false);
    const merged = windObstacleModel(base, [imported(100, ring(-20, -15, 20, 15), 30)]);
    const obs = rasterGroundWindObstacles(merged);
    expect(groundWindIsSolid(obs, 0, 0)).toBe(true);
    expect(groundWindIsSolid(obs, 70, 70)).toBe(true);
  });

  it("drops map buildings and trees under the import", () => {
    const base = modelWith(
      [building(1, ring(10, -10, 50, 10), 9), building(2, ring(-5, -5, 5, 5), 6), building(3, ring(60, 60, 80, 80), 9)],
      [tree(1, [0, 10]), tree(2, [23, 0], 8), tree(3, [-90, -90])],
    );
    const merged = windObstacleModel(base, [imported(100, ring(-20, -15, 20, 15), 30)]);
    expect(merged.buildings.map((b) => b.id)).toEqual([3, 100]);
    expect(merged.trees.map((t) => t.id)).toEqual([3]);
    const obs = rasterGroundWindObstacles(merged);
    expect(groundWindIsSolid(obs, 40, 0)).toBe(false);
    expect(groundWindIsSolid(obs, 10, 0)).toBe(true);
    expect(groundWindIsSolid(rasterGroundWindObstacles(base), 40, 0)).toBe(true);
  });

  it("calms the lee and speeds up the corners once the import is in", () => {
    const base = modelWith([
      building(1, ring(-12, -6, -2, 4), 7),
      building(2, ring(4, -6, 14, 4), 7),
      building(3, ring(-70, 60, -50, 80), 8),
    ]);
    const merged = windObstacleModel(base, [imported(100, ring(-20, -15, 20, 15), 60)]);
    const before = buildGroundWindGrid(base, NORTH_SECTOR);
    const after = buildGroundWindGrid(merged, NORTH_SECTOR);
    const lee: [number, number] = [0, -24];
    const corner: [number, number] = [26, -12];
    expect(speedAt(after, ...lee)).toBeLessThan(speedAt(before, ...lee));
    expect(speedAt(after, ...corner)).toBeGreaterThan(speedAt(before, ...corner));
  });

  it("keeps the model reference without imports and makes a new one per import list", () => {
    const base = modelWith([building(1, ring(60, 60, 80, 80), 9)]);
    expect(windObstacleModel(base, [])).toBe(base);
    const first = windObstacleModel(base, [imported(100, ring(-20, -15, 20, 15), 30)]);
    const moved = windObstacleModel(base, [imported(100, ring(-80, -80, -40, -50), 30)]);
    expect(first).not.toBe(base);
    expect(moved).not.toBe(first);
    expect(base.buildings).toHaveLength(1);
    const a = rasterGroundWindObstacles(first);
    const b = rasterGroundWindObstacles(moved);
    expect(groundWindIsSolid(a, 0, 0)).toBe(true);
    expect(groundWindIsSolid(b, 0, 0)).toBe(false);
    expect(groundWindIsSolid(b, -60, -65)).toBe(true);
  });
});
