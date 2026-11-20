import { describe, expect, it } from "vitest";
import {
  buildGroundWindGrid,
  createGroundWindGridBuilder,
  groundWindCellIndex,
  groundWindFieldCache,
  groundWindIsSolid,
  groundWindSector,
  rasterGroundWindObstacles,
  sampleGroundWindFlow,
  type GroundWindFlowGrid,
} from "./groundWindField";
import type { CityModel, Pt } from "../types";

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function modelWith(buildings: Array<{ ring: Pt[]; height: number }>, sideM = 240): CityModel {
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: buildings.map((b, i) => ({ id: i + 1, ring: b.ring, holes: [], height: b.height, use: "residential", source: "osm_tag" })),
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

const WEST_SECTOR = 12;

function at(grid: GroundWindFlowGrid, east: number, north: number) {
  return sampleGroundWindFlow(grid, east, north, { east: 0, north: 0, speed: 0 });
}

describe("groundWindField", () => {
  it("wraps sectors and falls back to north", () => {
    expect(groundWindSector(undefined)).toBe(0);
    expect(groundWindSector(16)).toBe(0);
    expect(groundWindSector(-1)).toBe(15);
  });

  it("rasterises footprints, not bounding boxes", () => {
    const lShape: Pt[] = [
      [-40, -40],
      [40, -40],
      [40, -20],
      [-20, -20],
      [-20, 40],
      [-40, 40],
      [-40, -40],
    ];
    const obs = rasterGroundWindObstacles(modelWith([{ ring: lShape, height: 12 }]));
    expect(groundWindIsSolid(obs, 0, -30)).toBe(true);
    expect(groundWindIsSolid(obs, -30, 0)).toBe(true);
    expect(groundWindIsSolid(obs, 20, 20)).toBe(false);
    expect(groundWindCellIndex(obs, 1000, 0)).toBe(-1);
    for (let k = 0; k < obs.fluidCells.length; k++) expect(obs.solid[obs.fluidCells[k]!]).toBe(0);
  });

  it("flips the flow between 0 and 180 degree headings", () => {
    const model = modelWith([{ ring: ring(-20, -30, 20, 30), height: 20 }]);
    const north = buildGroundWindGrid(model, 0);
    const south = buildGroundWindGrid(model, 8);
    for (const [e, n] of [
      [-80, 80],
      [80, -80],
      [-80, 0],
    ] as const) {
      expect(at(north, e, n).north).toBeLessThan(-0.5);
      expect(at(south, e, n).north).toBeGreaterThan(0.5);
    }
  });

  it("bends the flow around a building instead of into it", () => {
    const model = modelWith([{ ring: ring(-20, -30, 20, 30), height: 20 }]);
    const grid = buildGroundWindGrid(model, WEST_SECTOR);
    const above = at(grid, -24, 24);
    const below = at(grid, -24, -24);
    expect(above.east).toBeGreaterThan(0);
    expect(above.north).toBeGreaterThan(0.1);
    expect(below.north).toBeLessThan(-0.1);
    expect(at(grid, 0, 0).speed).toBe(0);
  });

  it("speeds up through the gap between two buildings", () => {
    const model = modelWith([
      { ring: ring(-30, 12, 30, 70), height: 15 },
      { ring: ring(-30, -70, 30, -12), height: 15 },
    ]);
    const grid = buildGroundWindGrid(model, WEST_SECTOR);
    const gap = at(grid, 0, 0).speed;
    const free = at(grid, -100, 100).speed;
    expect(free).toBeCloseTo(1, 1);
    expect(gap).toBeGreaterThan(free * 1.15);
  });

  it("shelters the wake behind a building", () => {
    const model = modelWith([{ ring: ring(-20, -30, 20, 30), height: 20 }]);
    const grid = buildGroundWindGrid(model, WEST_SECTOR);
    const wake = at(grid, 32, 0).speed;
    expect(wake).toBeLessThan(at(grid, -100, -100).speed * 0.6);
    expect(wake).toBeLessThan(at(grid, 0, 48).speed);
    expect(at(grid, 110, 0).speed).toBeGreaterThan(wake);
  });

  it("caches each heading so a season swap does not rebuild", () => {
    const model = modelWith([{ ring: ring(-30, -30, 30, 30), height: 12 }]);
    const cache = groundWindFieldCache(model);
    const summer = createGroundWindGridBuilder(cache, 8).finish();
    const winter = createGroundWindGridBuilder(cache, 0).finish();
    expect(cache.builds).toBe(2);
    const obstacles = cache.obstacles;
    const builder = createGroundWindGridBuilder(cache, 8);
    expect(builder.step(0)).toBe(true);
    expect(builder.finish()).toBe(summer);
    expect(createGroundWindGridBuilder(cache, 0).finish()).toBe(winter);
    expect(cache.builds).toBe(2);
    expect(cache.obstacles).toBe(obstacles);
    expect(summer.obstacles).toBe(winter.obstacles);
  });

  it("builds in bounded steps", () => {
    const model = modelWith([{ ring: ring(-30, -30, 30, 30), height: 12 }], 900);
    const builder = createGroundWindGridBuilder(groundWindFieldCache(model), WEST_SECTOR);
    let steps = 0;
    while (!builder.step(0.01)) steps++;
    expect(steps).toBeGreaterThan(3);
    expect(at(builder.finish(), 300, 300).east).toBeGreaterThan(0.5);
  });
});
