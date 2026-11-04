import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aggregateDemographicsForCut,
  buildDemographicsIndex,
  benchmarkPercentages,
  cutPercentages,
  demographicsDatasetInBounds,
} from "./demographicsClip";
import type { DemographicsDataset } from "./demographicsTypes";

function squareRing(centerLon: number, centerLat: number, sizeDeg: number): [number, number][] {
  const h = sizeDeg / 2;
  return [
    [centerLon - h, centerLat - h],
    [centerLon + h, centerLat - h],
    [centerLon + h, centerLat + h],
    [centerLon - h, centerLat + h],
  ];
}

function unit(
  code: string,
  centerLon: number,
  centerLat: number,
  population: number,
  areaKm2: number,
): DemographicsDataset["units"][number] {
  return {
    code,
    areaKm2,
    ring: squareRing(centerLon, centerLat, 0.004),
    population,
    age: {
      "0-14": population * 0.2,
      "15-24": population * 0.1,
      "25-34": population * 0.25,
      "35-49": population * 0.2,
      "50-64": population * 0.15,
      "65+": population * 0.1,
    },
    households: {
      lone: population * 0.3,
      couple: population * 0.25,
      family: population * 0.3,
      group: population * 0.15,
    },
  };
}

const fixture: DemographicsDataset = {
  version: 1,
  gccsa: "2GMEL",
  licence: "CC BY 4.0",
  source: "ABS Census 2021 General Community Profile (SA1)",
  bbox: { west: 144.9, south: -37.85, east: 145.0, north: -37.78 },
  benchmark: {
    population: 10_000,
    age: {
      "0-14": 2000,
      "15-24": 1000,
      "25-34": 2500,
      "35-49": 2000,
      "50-64": 1500,
      "65+": 1000,
    },
    households: { lone: 3000, couple: 2500, family: 3000, group: 1500 },
  },
  units: [
    unit("A", 144.963, -37.813, 1000, 0.25),
    unit("B", 144.968, -37.813, 500, 0.25),
    unit("C", 144.99, -37.813, 800, 0.25),
  ],
};

describe("demographicsClip", () => {
  it("detects coverage inside metro bbox", () => {
    expect(demographicsDatasetInBounds(fixture, { lon: 144.963, lat: -37.813 })).toBe(true);
    expect(demographicsDatasetInBounds(fixture, { lon: 140, lat: -33 })).toBe(false);
  });

  it("area-weights population across intersecting SA1 units", () => {
    const index = buildDemographicsIndex(fixture.units);
    const stats = aggregateDemographicsForCut({
      dataset: fixture,
      index,
      center: { lon: 144.963, lat: -37.813 },
      sideM: 500,
      canopyPct: 12,
    });
    expect(stats).not.toBeNull();
    expect(stats!.population).toBeGreaterThan(400);
    expect(stats!.population).toBeLessThan(1600);
    expect(stats!.sa1Cells).toBeGreaterThanOrEqual(1);
    expect(stats!.canopyPct).toBe(12);
  });

  it("returns null when the cut misses all SA1 units", () => {
    const index = buildDemographicsIndex(fixture.units);
    const stats = aggregateDemographicsForCut({
      dataset: fixture,
      index,
      center: { lon: 144.85, lat: -37.813 },
      sideM: 200,
      canopyPct: 0,
    });
    expect(stats).toBeNull();
  });

  it("aggregates household types for a Melbourne CBD cut when metro JSON is present", () => {
    const path = "public/demographics-metro.json";
    if (!existsSync(path)) return;
    const dataset = JSON.parse(readFileSync(path, "utf8")) as DemographicsDataset;
    const index = buildDemographicsIndex(dataset.units);
    const half = 500;
    const dLon = half / (111_320 * Math.cos(((-37.8136) * Math.PI) / 180));
    const dLat = half / 111_132;
    const hits = index.search({
      minX: 144.9633 - dLon,
      minY: -37.8136 - dLat,
      maxX: 144.9633 + dLon,
      maxY: -37.8136 + dLat,
    });
    const stats = aggregateDemographicsForCut({
      dataset,
      index,
      center: { lon: 144.9633, lat: -37.8136 },
      sideM: 1000,
      canopyPct: 0,
    });
    expect(stats).not.toBeNull();
    expect(stats!.population).toBeGreaterThan(1000);
    const hhTotal = Object.values(stats!.households).reduce((a, b) => a + b, 0);
    expect(hhTotal).toBeGreaterThan(100);
  });

  it("derives benchmark and cut percentage shares", () => {
    const stats = aggregateDemographicsForCut({
      dataset: fixture,
      index: buildDemographicsIndex(fixture.units),
      center: { lon: 144.963, lat: -37.813 },
      sideM: 600,
      canopyPct: 0,
    })!;
    const benchAge = benchmarkPercentages(fixture.benchmark, "age");
    expect(benchAge["25-34"]).toBeCloseTo(25, 1);
    const cutAge = cutPercentages(stats, "age");
    expect(Object.values(cutAge).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });
});
