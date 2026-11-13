import { describe, expect, it } from "vitest";
import { buildGroundWindField, groundWindInsideFootprint, groundWindIsSolid } from "./groundWindField";
import {
  createGroundWindParticles,
  GROUND_WIND_POINT_STRIDE,
  layoutGroundWindScreenSeeds,
  GROUND_WIND_POINTS_PER_PARTICLE,
  GROUND_WIND_TRAIL_POINTS,
  groundWindMaxTrailTurnDeg,
  groundWindMaxTrailWidthPx,
  groundWindMeanTrailScreenPx,
  groundWindMetresPerSecond,
  groundWindOrthographicProject,
  groundWindCoreWidthPx,
  groundWindTrailHistorySlots,
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

  it("keeps core trail width at 1.5px in screen space", () => {
    expect(groundWindMaxTrailWidthPx()).toBe(1.5);
    expect(groundWindCoreWidthPx(12)).toBe(1.5);
    expect(groundWindCoreWidthPx(28)).toBe(1.5);
    expect(groundWindCoreWidthPx(44)).toBe(1.5);
  });

  it("lengthens fast-stream trails", () => {
    const calm = trailVisibleSegments(0.5, 1, false, 0.04, 18);
    const fast = trailVisibleSegments(1.45, 1, true, 0.04, 18);
    expect(fast).toBeGreaterThan(calm);
  });

  it("keeps mean on-screen trail length at least 40px after advection", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.2 });
    const particles = createGroundWindParticles(field, flat, 7, undefined, 1800, model);
    const viewW = 1440;
    const viewH = 900;
    particles.metresPerPx = model.sideM / viewW;
    particles.viewWidth = viewW;
    particles.viewHeight = viewH;
    particles.cityModel = model;
    particles.screenProject = (east, north, y) => groundWindOrthographicProject(east, north, y, viewW, viewH, model.sideM);
    particles.screenUnproject = (sx, sy) => ({
      east: (sx / viewW - 0.5) * model.sideM,
      north: (sy / viewH - 0.5) * model.sideM,
    });
    layoutGroundWindScreenSeeds(particles, field, flat, model, 7);
    warmGroundWindParticles(particles, field, flat, groundWindMetresPerSecond(model.sideM, 20), 5);
    const meanPx = groundWindMeanTrailScreenPx(
      particles,
      field,
      flat,
      particles.screenProject,
      groundWindMetresPerSecond(model.sideM, 20),
    );
    expect(meanPx).toBeGreaterThanOrEqual(40);
  }, 20_000);

  it("bends trail headings more than 15 degrees around a building corner", () => {
    const model: CityModel = {
      placeLabel: "Corner",
      center: { lon: 145, lat: -38 },
      sideM: 240,
      layers: { buildings: true, roads: true, waterGreen: true, trees: true },
      buildings: [
        {
          id: 1,
          ring: ring(-24, -24, 24, 24),
          holes: [],
          height: 18,
          use: "residential",
          source: "osm_tag",
        },
      ],
      roads: [],
      areas: [],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "",
    };
    const field = buildGroundWindField(model, { east: 1, north: 0.05 });
    const particles = createGroundWindParticles(field, flat, 19);
    warmGroundWindParticles(particles, field, flat, groundWindMetresPerSecond(model.sideM, 22), 6);
    const streamMag = Math.hypot(field.base.east, field.base.north);
    let bestTurn = 0;
    for (let i = 0; i < particles.count; i++) {
      const e = particles.east[i]!;
      const n = particles.north[i]!;
      if (Math.abs(e - 26) > 18 || Math.abs(n) > 22) continue;
      const speed = particles.speed[i]!;
      const fast = speed > streamMag * 1.3;
      const visible = trailVisibleSegments(speed, streamMag, fast, 0.04, groundWindMetresPerSecond(model.sideM, 22));
      const pts = groundWindTrailHistorySlots(particles, i, visible);
      const turn = groundWindMaxTrailTurnDeg(pts);
      if (turn > bestTurn) bestTurn = turn;
    }
    expect(bestTurn).toBeGreaterThan(15);
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

  it("spreads screen seeds with jittered poisson spacing", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.15 });
    const viewW = 1440;
    const viewH = 900;
    const particles = createGroundWindParticles(field, flat, 9, undefined, 600, model);
    particles.viewWidth = viewW;
    particles.viewHeight = viewH;
    particles.cityModel = model;
    particles.screenProject = (east, north, y) => groundWindOrthographicProject(east, north, y, viewW, viewH, model.sideM);
    particles.screenUnproject = (sx, sy) => ({
      east: (sx / viewW - 0.5) * model.sideM,
      north: (sy / viewH - 0.5) * model.sideM,
    });
    layoutGroundWindScreenSeeds(particles, field, flat, model, 9);
    for (let i = 0; i < particles.count; i++) {
      const screen = particles.screenProject(particles.east[i]!, particles.north[i]!, 1);
      if (screen) {
        particles.screenX[i] = screen.x;
        particles.screenY[i] = screen.y;
      }
    }
    let minDist = Number.POSITIVE_INFINITY;
    const sample = Math.min(particles.count, 80);
    for (let i = 0; i < sample; i++) {
      for (let j = i + 1; j < sample; j++) {
        const d = Math.hypot(particles.screenX[i]! - particles.screenX[j]!, particles.screenY[i]! - particles.screenY[j]!);
        if (d > 0 && d < minDist) minDist = d;
      }
    }
    expect(minDist).toBeGreaterThanOrEqual(11);
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
