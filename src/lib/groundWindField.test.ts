import { describe, expect, it } from "vitest";
import {
  buildGroundWindField,
  createGroundWindFieldBuilder,
  groundWindBaseVector,
  groundWindCellIndex,
  groundWindIsSolid,
  groundWindSpeedAt,
  groundWindVelocityAt,
  rasterSolids,
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

const westerly = { east: 1, north: 0 };

describe("groundWindField", () => {
  it("points downwind of the prevailing sector and falls back to a unit vector", () => {
    const east = groundWindBaseVector(4);
    const fallback = groundWindBaseVector(undefined);
    expect(east.east).toBeCloseTo(-1, 5);
    expect(Math.hypot(fallback.east, fallback.north)).toBeCloseTo(1, 5);
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
    const raster = rasterSolids(modelWith([{ ring: lShape, height: 12 }]));
    const at = (e: number, n: number) =>
      raster.solid[Math.floor((n - raster.originN) / raster.cellM) * raster.cols + Math.floor((e - raster.originE) / raster.cellM)];
    expect(at(0, -30)).toBe(1);
    expect(at(-30, 0)).toBe(1);
    expect(at(20, 20)).toBe(0);
  });

  it("drives velocity normal to walls to zero", () => {
    const model = modelWith([{ ring: ring(-30, -30, 30, 30), height: 12 }]);
    const field = buildGroundWindField(model, westerly);
    const faceE = field.originE + Math.floor((-30 - field.originE) / field.cellM) * field.cellM;
    const out = { east: 0, north: 0 };
    for (const n of [-20, -8, 0, 11, 24]) {
      groundWindVelocityAt(field, faceE, n, out);
      expect(Math.abs(out.east)).toBeLessThan(0.05);
    }
    const faceN = field.originN + Math.floor((30 - field.originN) / field.cellM + 1) * field.cellM;
    for (const e of [-20, 0, 20]) {
      groundWindVelocityAt(field, e, faceN, out);
      expect(Math.abs(out.north)).toBeLessThan(0.08);
    }
  });

  it("speeds up through the gap between two buildings", () => {
    const model = modelWith([
      { ring: ring(-30, 12, 30, 70), height: 15 },
      { ring: ring(-30, -70, 30, -12), height: 15 },
    ]);
    const field = buildGroundWindField(model, westerly);
    const gap = groundWindSpeedAt(field, 0, 0);
    const free = groundWindSpeedAt(field, -100, 100);
    expect(free).toBeGreaterThan(0.85);
    expect(gap).toBeGreaterThan(1.15);
    expect(gap).toBeGreaterThan(free * 1.15);
  });

  it("shelters the wake behind a building", () => {
    const model = modelWith([{ ring: ring(-20, -30, 20, 30), height: 20 }]);
    const field = buildGroundWindField(model, westerly);
    const wake = groundWindSpeedAt(field, 32, 0);
    const beside = groundWindSpeedAt(field, 0, 48);
    const free = groundWindSpeedAt(field, -100, -100);
    expect(wake).toBeLessThan(free * 0.6);
    expect(wake).toBeLessThan(beside);
    expect(groundWindSpeedAt(field, 110, 0)).toBeGreaterThan(wake);
  });

  it("keeps solid cells out of the fluid spawn list", () => {
    const model = modelWith([{ ring: ring(-30, -30, 30, 30), height: 12 }]);
    const field = buildGroundWindField(model, westerly);
    for (let k = 0; k < field.fluidCells.length; k++) {
      expect(field.solid[field.fluidCells[k]!]).toBe(0);
    }
    expect(groundWindIsSolid(field, 0, 0)).toBe(true);
    expect(groundWindIsSolid(field, 80, 80)).toBe(false);
    expect(groundWindCellIndex(field, 1000, 0)).toBe(-1);
  });

  it("builds in bounded steps and matches the synchronous build", () => {
    const model = modelWith([{ ring: ring(-30, -30, 30, 30), height: 12 }]);
    const builder = createGroundWindFieldBuilder(model, westerly);
    let steps = 0;
    while (!builder.step(0.25)) steps++;
    expect(steps).toBeGreaterThan(1);
    const stepped = builder.finish();
    const direct = buildGroundWindField(model, westerly);
    expect(groundWindSpeedAt(stepped, 60, 40)).toBeCloseTo(groundWindSpeedAt(direct, 60, 40), 6);
  });
});
