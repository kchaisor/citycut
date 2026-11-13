import { describe, expect, it } from "vitest";
import { buildGroundWindField, groundWindInsideFootprint, groundWindIsSolid } from "./groundWindField";
import {
  createGroundWindParticles,
  GROUND_WIND_POINT_STRIDE,
  GROUND_WIND_POINTS_PER_PARTICLE,
  GROUND_WIND_TRAIL_POINTS,
  groundWindMaxTrailWidthPx,
  groundWindMetresPerSecond,
  groundWindSeedRowScore,
  groundWindTrailWidthPx,
  lifeEnvelope,
  speedRamp,
  stepGroundWindParticles,
  trailVisibleSegments,
  warmGroundWindParticles,
} from "./groundWindParticles";
import type { CityModel, Pt } from "../types";

const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function denseModel(): CityModel {
  const buildings = [];
  let id = 1;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      buildings.push({ id: id++, ring: ring(i * 60 - 18, j * 60 - 18, i * 60 + 18, j * 60 + 18), holes: [], height: 12, use: "residential" as const, source: "osm_tag" as const });
    }
  }
  return {
    placeLabel: "Test",
    center: { lon: 145, lat: -38 },
    sideM: 320,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings,
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

const flat = () => 1;

describe("groundWindParticles", () => {
  it("never spawns inside a footprint and never leaves a trail point there", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 0.8, north: 0.6 });
    const particles = createGroundWindParticles(field, flat);
    for (let i = 0; i < particles.count; i++) {
      expect(groundWindIsSolid(field, particles.east[i]!, particles.north[i]!)).toBe(false);
      expect(groundWindInsideFootprint(model, particles.east[i]!, particles.north[i]!)).toBe(false);
    }
    warmGroundWindParticles(particles, field, flat, groundWindMetresPerSecond(model.sideM, 20), 4);
    for (let i = 0; i < particles.count; i++) {
      expect(groundWindIsSolid(field, particles.east[i]!, particles.north[i]!)).toBe(false);
      expect(groundWindInsideFootprint(model, particles.east[i]!, particles.north[i]!)).toBe(false);
      for (let k = 0; k < GROUND_WIND_TRAIL_POINTS; k++) {
        const base = (i * GROUND_WIND_POINTS_PER_PARTICLE + k) * GROUND_WIND_POINT_STRIDE;
        const east = particles.points[base]!;
        const north = -particles.points[base + 2]!;
        expect(groundWindInsideFootprint(model, east, north)).toBe(false);
      }
    }
  });

  it("caps rendered trail width at 2px and tapers toward the tail", () => {
    expect(groundWindMaxTrailWidthPx()).toBeLessThanOrEqual(2);
    expect(groundWindTrailWidthPx(0)).toBeLessThan(groundWindTrailWidthPx(1));
    expect(groundWindTrailWidthPx(1)).toBeLessThanOrEqual(2);
  });

  it("lengthens fast-stream trails", () => {
    const calm = trailVisibleSegments(0.5, 1, false);
    const fast = trailVisibleSegments(1.45, 1, true);
    expect(fast).toBeGreaterThan(calm);
  });

  it("staggers lifetimes and keeps trail alpha fading to the tail", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0 });
    const particles = createGroundWindParticles(field, flat);
    const ages = new Set<number>();
    for (let i = 0; i < particles.count; i++) ages.add(Math.round(particles.age[i]! * 10));
    expect(ages.size).toBeGreaterThan(20);
    stepGroundWindParticles(particles, field, flat, 1 / 60, groundWindMetresPerSecond(model.sideM, 20));
    for (let i = 0; i < particles.count; i++) {
      const base = i * GROUND_WIND_POINTS_PER_PARTICLE * GROUND_WIND_POINT_STRIDE;
      const tail = particles.points[base + 3]!;
      const head = particles.points[base + (GROUND_WIND_TRAIL_POINTS - 1) * GROUND_WIND_POINT_STRIDE + 3]!;
      const pad = particles.points[base + GROUND_WIND_TRAIL_POINTS * GROUND_WIND_POINT_STRIDE + 3]!;
      expect(tail).toBe(0);
      expect(head).toBeGreaterThanOrEqual(tail);
      expect(pad).toBe(0);
    }
  });

  it("brightens with speed and fades at the ends of a life", () => {
    expect(speedRamp(0)).toBeLessThan(speedRamp(0.5));
    expect(speedRamp(0.5)).toBeLessThan(speedRamp(1.3));
    expect(lifeEnvelope(0, 5)).toBe(0);
    expect(lifeEnvelope(2.5, 5)).toBeGreaterThan(0.75);
    expect(lifeEnvelope(5, 5)).toBeLessThan(0.05);
  });

  it("keeps seeding off regular row bands", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.15 });
    const particles = createGroundWindParticles(field, flat);
    const score = groundWindSeedRowScore(particles.east, particles.north, particles.count, field.cellM);
    expect(score).toBeLessThan(7);
  });

  it("advects particles along the flow", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0 });
    const particles = createGroundWindParticles(field, flat);
    const before = Float32Array.from(particles.east);
    const ages = Float32Array.from(particles.age);
    stepGroundWindParticles(particles, field, flat, 1 / 30, 20);
    let moved = 0;
    for (let i = 0; i < particles.count; i++) {
      if (particles.age[i]! > ages[i]! && particles.east[i]! > before[i]!) moved++;
    }
    expect(moved).toBeGreaterThan(particles.count * 0.8);
  });

  it("scales the visual speed with the cut and the median wind", () => {
    expect(groundWindMetresPerSecond(1000, 30)).toBeGreaterThan(groundWindMetresPerSecond(1000, 10));
    expect(groundWindMetresPerSecond(1000, 18)).toBeGreaterThan(groundWindMetresPerSecond(200, 18));
  });
});
