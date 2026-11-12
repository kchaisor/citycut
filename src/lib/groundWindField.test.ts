import { describe, expect, it } from "vitest";
import {
  buildGroundWindParticles,
  groundWindBaseVector,
  groundWindGlyphScaleM,
  GROUND_WIND_PARTICLE_COUNT,
} from "./groundWindField";
import type { CityModel, Pt } from "../types";

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function tinyModel(): CityModel {
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM: 200,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [{ id: 1, ring: ring(-20, -20, 20, 20), holes: [], height: 10, use: "residential", source: "osm_tag" }],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

describe("groundWindField", () => {
  it("uses prevailing sector when stats are present", () => {
    const withStats = groundWindBaseVector({
      period: "annual",
      totalHours: 1,
      calmHours: 0,
      calmPercent: 0,
      sectorFrequency: [],
      prevailingSector: 6,
      prevailingLabel: "E",
      prevailingMedianKmh: 18,
    });
    const fallback = groundWindBaseVector(null);
    expect(Math.hypot(withStats.east, withStats.north)).toBeCloseTo(1, 5);
    expect(Math.hypot(fallback.east, fallback.north)).toBeCloseTo(1, 5);
  });

  it("scales glyphs for kilometre cuts", () => {
    const km = groundWindGlyphScaleM(1000);
    expect(km.length).toBeGreaterThanOrEqual(20);
    expect(km.width).toBeGreaterThanOrEqual(3);
  });

  it("builds a dense particle field", () => {
    const particles = buildGroundWindParticles(tinyModel(), null);
    expect(particles).toHaveLength(GROUND_WIND_PARTICLE_COUNT);
  });

  it("assigns lower speed factors in built-up samples", () => {
    const model = tinyModel();
    const particles = buildGroundWindParticles(model, null);
    const center = particles.filter((p) => Math.abs(p.east) < 25 && Math.abs(p.north) < 25);
    const edge = particles.filter((p) => Math.abs(p.east) > 70 || Math.abs(p.north) > 70);
    expect(center.length).toBeGreaterThan(0);
    expect(edge.length).toBeGreaterThan(0);
    const centerAvg = center.reduce((s, p) => s + p.speed, 0) / center.length;
    const edgeAvg = edge.reduce((s, p) => s + p.speed, 0) / edge.length;
    expect(centerAvg).toBeLessThan(edgeAvg);
  });
});
