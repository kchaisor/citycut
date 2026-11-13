import { describe, expect, it } from "vitest";
import { buildGroundWindField } from "./groundWindField";
import { groundWindRenderStats } from "./groundWindDebug";
import {
  createGroundWindParticles,
  GROUND_WIND_PARTICLES_MAX,
  groundWindFrameCoverageProxy,
  groundWindMetresPerSecond,
  groundWindOrthographicProject,
  layoutGroundWindScreenSeeds,
  stepGroundWindParticles,
  GROUND_WIND_RESPAWN_MAX_TRIES,
  type GroundWindStepBench,
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
      buildings.push({
        id: id++,
        ring: ring(i * 60 - 18, j * 60 - 18, i * 60 + 18, j * 60 + 18),
        holes: [],
        height: 12,
        use: "residential" as const,
        source: "osm_tag" as const,
      });
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

describe("groundWindRender", () => {
  it("keeps drawable particle count at layout level through simulated frames", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.12 });
    const viewW = 1440;
    const viewH = 900;
    const flat = () => 1;
    const particles = createGroundWindParticles(field, flat, 29, undefined, GROUND_WIND_PARTICLES_MAX, model);
    particles.viewWidth = viewW;
    particles.viewHeight = viewH;
    particles.cityModel = model;
    particles.metresPerPx = model.sideM / viewW;
    particles.screenProject = (east, north, y) => groundWindOrthographicProject(east, north, y, viewW, viewH, model.sideM);
    particles.screenUnproject = (sx, sy) => ({
      east: (sx / viewW - 0.5) * model.sideM,
      north: (sy / viewH - 0.5) * model.sideM,
    });
    const layoutCount = layoutGroundWindScreenSeeds(particles, field, flat, model, 29);
    expect(particles.count).toBe(layoutCount);
    const mps = groundWindMetresPerSecond(model.sideM, 20);
    for (let step = 0; step < 160; step++) {
      stepGroundWindParticles(particles, field, flat, 1 / 60, mps);
    }
    const stats = groundWindRenderStats(particles, viewW);
    expect(stats.active).toBeGreaterThanOrEqual(layoutCount);
    expect(stats.layoutActive).toBe(layoutCount);
    expect(stats.drawable).toBeGreaterThanOrEqual(layoutCount * 0.88);
  }, 30_000);

  it("keeps wind updates under 4ms mean with no respawn raycasts after layout", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.12 });
    const viewW = 1440;
    const viewH = 900;
    const flat = () => 1;
    const particles = createGroundWindParticles(field, flat, 31, undefined, GROUND_WIND_PARTICLES_MAX, model);
    particles.viewWidth = viewW;
    particles.viewHeight = viewH;
    particles.cityModel = model;
    particles.metresPerPx = model.sideM / viewW;
    particles.screenProject = (east, north, y) => groundWindOrthographicProject(east, north, y, viewW, viewH, model.sideM);
    particles.screenUnproject = (sx, sy) => ({
      east: (sx / viewW - 0.5) * model.sideM,
      north: (sy / viewH - 0.5) * model.sideM,
    });
    layoutGroundWindScreenSeeds(particles, field, flat, model, 31);
    const mps = groundWindMetresPerSecond(model.sideM, 20);
  const bench: GroundWindStepBench = { respawns: 0, respawnRaycasts: 0, respawnLoopMax: 0 };
    const times: number[] = [];
    for (let step = 0; step < 180; step++) {
      const frameBench: GroundWindStepBench = { respawns: 0, respawnRaycasts: 0, respawnLoopMax: 0 };
      const t0 = performance.now();
      stepGroundWindParticles(particles, field, flat, 1 / 60, mps, frameBench);
      const elapsed = performance.now() - t0;
      if (step >= 20) times.push(elapsed);
      expect(frameBench.respawnRaycasts).toBe(0);
      expect(frameBench.respawnLoopMax).toBeLessThanOrEqual(GROUND_WIND_RESPAWN_MAX_TRIES);
      bench.respawnLoopMax = Math.max(bench.respawnLoopMax, frameBench.respawnLoopMax);
    }
    expect(particles.count).toBeGreaterThan(2000);
    const meanMs = times.reduce((sum, t) => sum + t, 0) / times.length;
    expect(meanMs).toBeLessThan(4);
    expect(bench.respawnRaycasts).toBe(0);
  }, 60_000);

  it("keeps drawn coverage steady across frames without global pulse", () => {
    const model = denseModel();
    const field = buildGroundWindField(model, { east: 1, north: 0.12 });
    const viewW = 1440;
    const viewH = 900;
    const flat = () => 1;
    const particles = createGroundWindParticles(field, flat, 37, undefined, GROUND_WIND_PARTICLES_MAX, model);
    particles.viewWidth = viewW;
    particles.viewHeight = viewH;
    particles.cityModel = model;
    particles.metresPerPx = model.sideM / viewW;
    particles.screenProject = (east, north, y) => groundWindOrthographicProject(east, north, y, viewW, viewH, model.sideM);
    particles.screenUnproject = (sx, sy) => ({
      east: (sx / viewW - 0.5) * model.sideM,
      north: (sy / viewH - 0.5) * model.sideM,
    });
    layoutGroundWindScreenSeeds(particles, field, flat, model, 37);
    const streamMag = Math.hypot(field.base.east, field.base.north) || 1;
    const mps = groundWindMetresPerSecond(model.sideM, 20);
    const samples: number[] = [];
    for (let step = 0; step < 30; step++) {
      stepGroundWindParticles(particles, field, flat, 1 / 60, mps);
      samples.push(groundWindFrameCoverageProxy(particles, viewW, viewH, streamMag));
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(min).toBeGreaterThan(0);
    expect(max / min).toBeLessThanOrEqual(1.3);
  }, 60_000);
});
