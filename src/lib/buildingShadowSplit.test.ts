import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPlanShadowCache,
  planShadowRings,
  planShadowSplitRings,
  proposedMassingInModel,
} from "./buildingShadows";
import type { BuildingFeat, CityModel, Ring } from "../types";

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
  }
  return sum / 2;
}

const CBD = { lat: -37.8136, lon: 144.9631 };

function box(
  id: number,
  east: number,
  north: number,
  size: number,
  height: number,
  importedMassing = false,
): BuildingFeat {
  const half = size / 2;
  return {
    id,
    ring: [
      [east - half, north - half],
      [east + half, north - half],
      [east + half, north + half],
      [east - half, north + half],
      [east - half, north - half],
    ],
    holes: [],
    height,
    use: "unclassified",
    source: "none",
    ...(importedMassing ? { importedMassing: true as const } : {}),
  };
}

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Test",
    center: CBD,
    sideM: 200,
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

const when = { lat: CBD.lat, lon: CBD.lon, year: 2026, month: 9, day: 22, hour: 15, minute: 0 };

function shadowArea(rings: { length: number }[][]): number {
  let total = 0;
  for (const polygon of rings) {
    if (!polygon[0]) continue;
    total += Math.abs(ringArea(polygon[0] as Ring));
  }
  return total;
}

describe("plan shadow split (existing vs proposed massing)", () => {
  beforeEach(() => clearPlanShadowCache());

  it("has no added shadow without proposed massing", () => {
    const m = model([box(1, 0, 0, 20, 18)]);
    expect(proposedMassingInModel(m)).toBe(false);
    const split = planShadowSplitRings(m, when, true);
    expect(split.added).toEqual([]);
    expect(split.existing.length).toBeGreaterThan(0);
    expect(planShadowRings(m, when, true)).toEqual(split.existing);
  });

  it("splits full shadow into context and proposal-added regions", () => {
    const m = model([box(1, -30, 0, 24, 14), box(2, 25, 10, 18, 22, true)]);
    expect(proposedMassingInModel(m)).toBe(true);
    const split = planShadowSplitRings(m, when, true);
    expect(split.existing.length).toBeGreaterThan(0);
    expect(split.added.length).toBeGreaterThan(0);
    expect(shadowArea(split.added)).toBeGreaterThan(20);
    const full = shadowArea(planShadowRings(m, when, true));
    const parts = shadowArea(split.existing) + shadowArea(split.added);
    expect(parts).toBeGreaterThan(full * 0.92);
    expect(parts).toBeLessThan(full * 1.08);
  });
});
