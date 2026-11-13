import { describe, expect, it } from "vitest";
import { buildGroundWindField } from "./groundWindField";
import { groundWindRenderStats } from "./groundWindDebug";
import {
  createGroundWindParticles,
  GROUND_WIND_CORE_WIDTH_PX,
  GROUND_WIND_PARTICLES_MAX,
  GROUND_WIND_TRAIL_SCREEN_CAP_PX,
  groundWindDrawnInkFromPoints,
  groundWindFrameCoverageProxy,
  groundWindMetresPerSecond,
  groundWindOrthographicProject,
  groundWindSeQuarterBalance,
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

function windScene(seed: number) {
  const model = denseModel();
  const field = buildGroundWindField(model, { east: 1, north: 0.12 });
  const viewW = 1440;
  const viewH = 900;
  const flat = () => 1;
  const particles = createGroundWindParticles(field, flat, seed, undefined, GROUND_WIND_PARTICLES_MAX, model);
  particles.viewWidth = viewW;
  particles.viewHeight = viewH;
  particles.cityModel = model;
  particles.metresPerPx = model.sideM / viewW;
  particles.screenProject = (east, north, y) => groundWindOrthographicProject(east, north, y, viewW, viewH, model.sideM);
  particles.screenUnproject = (sx, sy) => ({
    east: (sx / viewW - 0.5) * model.sideM,
    north: (sy / viewH - 0.5) * model.sideM,
  });
  layoutGroundWindScreenSeeds(particles, field, flat, model, seed);
  const mps = groundWindMetresPerSecond(model.sideM, 20);
  return { model, field, particles, flat, viewW, viewH, mps };
}

describe("groundWindRender", () => {
  it("keeps drawable particle count at layout level through simulated frames", () => {
    const { particles, field, flat, viewW, mps } = windScene(29);
    const layoutCount = particles.layoutCount;
    expect(particles.count).toBe(layoutCount);
    for (let step = 0; step < 160; step++) {
      stepGroundWindParticles(particles, field, flat, 1 / 60, mps);
    }
    const stats = groundWindRenderStats(particles, viewW);
    expect(stats.active).toBeGreaterThanOrEqual(layoutCount);
    expect(stats.layoutActive).toBe(layoutCount);
    expect(stats.drawable).toBeGreaterThanOrEqual(layoutCount * 0.88);
  }, 30_000);

  it("keeps wind updates under 4ms mean with no respawn raycasts after layout", () => {
    const { particles, field, flat, mps, model, viewW, viewH } = windScene(31);
    layoutGroundWindScreenSeeds(particles, field, flat, model, 31, 2100);
    particles.viewWidth = viewW;
    particles.viewHeight = viewH;
    const bench: GroundWindStepBench = { respawns: 0, respawnRaycasts: 0, respawnLoopMax: 0 };
    const times: number[] = [];
    for (let step = 0; step < 180; step++) {
      const frameBench: GroundWindStepBench = { respawns: 0, respawnRaycasts: 0, respawnLoopMax: 0 };
      stepGroundWindParticles(particles, field, flat, 1 / 60, mps, frameBench);
      const elapsed = (frameBench.advectMs ?? 0) + (frameBench.writeMs ?? 0);
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

  it("keeps drawn segment ink steady across consecutive frames", () => {
    const { particles, field, flat, viewW, viewH, mps } = windScene(37);
    for (let step = 0; step < 80; step++) {
      stepGroundWindParticles(particles, field, flat, 1 / 60, mps);
    }
    const inkSamples: number[] = [];
    const segSamples: number[] = [];
    for (let step = 0; step < 30; step++) {
      stepGroundWindParticles(particles, field, flat, 1 / 60, mps);
      inkSamples.push(groundWindFrameCoverageProxy(particles));
      segSamples.push(particles.lastDrawnSegments);
    }
    const inkMin = Math.min(...inkSamples);
    const inkMax = Math.max(...inkSamples);
    expect(inkMin).toBeGreaterThan(0);
    expect(inkMax / inkMin).toBeLessThanOrEqual(1.25);
    const segMin = Math.min(...segSamples);
    const segMax = Math.max(...segSamples);
    expect(segMax / segMin).toBeLessThanOrEqual(1.25);
    const drawn = groundWindDrawnInkFromPoints(particles, flat, viewW, viewH);
    expect(drawn.segments).toBeGreaterThan(0);
    expect(particles.lastDrawnSegments).toBeGreaterThan(0);
  }, 90_000);

  it("caps stroke width and projected screen length in the point buffer", () => {
    const { particles, field, flat, viewW, viewH, mps } = windScene(41);
    for (let step = 0; step < 120; step++) {
      stepGroundWindParticles(particles, field, flat, 1 / 60, mps);
    }
    expect(particles.lastDrawnMaxLenPx).toBeLessThanOrEqual(GROUND_WIND_TRAIL_SCREEN_CAP_PX + 12);
    groundWindDrawnInkFromPoints(particles, flat, viewW, viewH);
    expect(GROUND_WIND_CORE_WIDTH_PX).toBeLessThanOrEqual(2);
    let maxCoreAttrib = 0;
    for (let i = 0; i < particles.count; i++) {
      const base = i * 29 * 8;
      for (let k = 0; k < 28; k++) {
        const w = particles.points[base + k * 8 + 6]!;
        if (w > maxCoreAttrib) maxCoreAttrib = w;
      }
    }
    expect(maxCoreAttrib).toBeLessThanOrEqual(2);
  }, 60_000);

  it("balances heads in the SE quarter horizontally after layout", () => {
    const { particles } = windScene(43);
    const { left, right, ratio } = groundWindSeQuarterBalance(particles);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(2.2);
  });
});
