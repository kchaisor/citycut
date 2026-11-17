import { describe, expect, it } from "vitest";
import type { CityModel, Pt } from "../types";
import { WIND_SPEED_BIN_EDGES_MS } from "./windBins";
import { windSeasonWeights } from "./windComfort";
import type { WindRoseSeasonRecord } from "./windRoseData";
import {
  boxBlur3,
  cachedWindPlanSpeed,
  createWindPlanComfortJob,
  createWindPlanSpeedJob,
  fillSolidCells,
  rampRgb,
  windPlanSpeedKey,
  type WindPlanGeometry,
  type WindPlanJob,
} from "./windPlanField";

const WEST = 12;
const EAST = 4;

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function oneBuilding(): CityModel {
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM: 240,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [{ id: 1, ring: ring(-12, -12, 12, 12), holes: [], height: 20, use: "residential", source: "osm_tag" }],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

function season(sectorBins: Record<number, number[]>, calmPct = 10): WindRoseSeasonRecord {
  const sectors = Array.from({ length: 16 }, (_, s) => sectorBins[s] ?? [0, 0, 0, 0, 0]);
  return { calmPct, prevailingDirDeg: 0, meanSpeedMs: 3, sectors };
}

function run<T>(job: WindPlanJob<T> | null): T {
  expect(job).not.toBeNull();
  let guard = 0;
  while (!job!.step(1)) {
    guard += 1;
    if (guard > 100_000) throw new Error("job never finished");
  }
  return job!.result()!;
}

function at(geometry: WindPlanGeometry, values: Float32Array, east: number, north: number): number {
  const i = Math.floor((east - geometry.originE) / geometry.cellM);
  const j = Math.floor((north - geometry.originN) / geometry.cellM);
  return values[j * geometry.cols + i]!;
}

describe("wind plan speed field", () => {
  const weights = windSeasonWeights(season({ [WEST]: [0.2, 0.3, 0.1, 0, 0], [EAST]: [0.2, 0.1, 0, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);

  it("is slower in the lee of a building than upwind, and flips with the direction", () => {
    const model = oneBuilding();
    const west = run(createWindPlanSpeedJob(model, "test:annual", weights, WEST));
    const lee = at(west.geometry, west.speedMs, 30, 0);
    const windward = at(west.geometry, west.speedMs, -30, 0);
    expect(lee).toBeLessThan(windward * 0.7);

    const east = run(createWindPlanSpeedJob(model, "test:annual", weights, EAST));
    expect(at(east.geometry, east.speedMs, -30, 0)).toBeLessThan(at(east.geometry, east.speedMs, 30, 0) * 0.7);
  });

  it("is in m/s: open ground runs at the direction's reference speed", () => {
    const model = oneBuilding();
    const west = run(createWindPlanSpeedJob(model, "test:annual", weights, WEST));
    expect(at(west.geometry, west.speedMs, -110, 100)).toBeCloseTo(west.referenceMs, 1);
  });

  it("caches each season and direction once", () => {
    const model = oneBuilding();
    const first = run(createWindPlanSpeedJob(model, "test:annual", weights, WEST));
    expect(cachedWindPlanSpeed(model, windPlanSpeedKey("test:annual", WEST))).toBe(first);
    const again = createWindPlanSpeedJob(model, "test:annual", weights, WEST)!;
    expect(again.result()).toBe(first);
  });

  it("has no field for a direction with no wind", () => {
    expect(createWindPlanSpeedJob(oneBuilding(), "test:annual", weights, 0)).toBeNull();
  });
});

describe("wind plan comfort field", () => {
  it("finds no unsafe area in light wind", () => {
    const weights = windSeasonWeights(season({ [WEST]: [0.5, 0.4, 0, 0, 0] }), WIND_SPEED_BIN_EDGES_MS);
    const comfort = run(createWindPlanComfortJob(oneBuilding(), "light:annual", weights));
    expect(comfort.unsafeAreas).toHaveLength(0);
    expect(Math.max(...comfort.fields.p15)).toBe(0);
  });

  it("flags open ground as unsafe in a gale and keeps the lee calmer", () => {
    const weights = windSeasonWeights(season({ [WEST]: [0, 0, 0, 0, 0.9] }), WIND_SPEED_BIN_EDGES_MS);
    const comfort = run(createWindPlanComfortJob(oneBuilding(), "gale:annual", weights));
    expect(comfort.unsafeAreas.length).toBeGreaterThan(0);
    const { geometry, fields } = comfort;
    expect(at(geometry, fields.p15, 30, 0)).toBeLessThan(at(geometry, fields.p15, -30, 0));
    expect(at(geometry, fields.p15, 0, 0)).toBe(0);
  });
});

describe("field helpers", () => {
  it("fills building cells from their open neighbours", () => {
    const values = Float32Array.from([1, 0, 3]);
    const solid = Uint8Array.from([0, 1, 0]);
    expect(Array.from(fillSolidCells(values, solid, 3, 1, 1))).toEqual([1, 2, 3]);
  });

  it("keeps a flat field flat when blurred", () => {
    const flat = new Float32Array(25).fill(2);
    expect(Array.from(boxBlur3(flat, 5, 5)).every((v) => Math.abs(v - 2) < 1e-6)).toBe(true);
  });

  it("maps m/s onto the ramp and clamps at the ends", () => {
    const stops = [
      { ms: 0, rgb: [0, 0, 0] as [number, number, number] },
      { ms: 6, rgb: [60, 120, 240] as [number, number, number] },
    ];
    const out: [number, number, number] = [0, 0, 0];
    expect(rampRgb(stops, 3, out)).toEqual([30, 60, 120]);
    expect(rampRgb(stops, 9, out)).toEqual([60, 120, 240]);
    expect(rampRgb(stops, -1, out)).toEqual([0, 0, 0]);
  });
});
