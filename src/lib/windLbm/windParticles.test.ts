import { describe, expect, it } from "vitest";
import {
  advectWindParticles,
  maxParticleTrailSegmentM,
  particleBinOccupancyFraction,
  spawnWindParticles,
  WIND_TRAIL_SAMPLES,
} from "./windParticles";
import { postObstacleSpeedDrop, settledWestFlowState, singleBlockObstacle } from "./lbmInvariants";
import { windLbmGridSpec } from "./obstacleRaster";
import { createLbmState, inflowFromDirectionDeg, lbmStepMany, speedLuFromKmh } from "./lbmCpu";

describe("windParticles", () => {
  it("initializes every trail sample at the spawn position (no 0,0 hub)", () => {
    const particles = spawnWindParticles(64, 80, 0);
    for (const p of particles) {
      for (let t = 0; t < WIND_TRAIL_SAMPLES; t++) {
        expect(p.trailEast[t]).toBeCloseTo(p.east, 5);
        expect(p.trailNorth[t]).toBeCloseTo(p.north, 5);
      }
    }
  });

  it("occupies most 10×10 bins across the cut", () => {
    const particles = spawnWindParticles(1200, 100, 15);
    const occ = particleBinOccupancyFraction(particles, 100, 10);
    expect(occ).toBeGreaterThan(0.6);
  });

  it("keeps every trail segment shorter than ~3 grid cells after long advection", () => {
    const state = settledWestFlowState(96);
    const particles = spawnWindParticles(500, 100, 7);
    for (let s = 0; s < 180; s++) advectWindParticles(particles, state, 0.032, 100);
    const cellM = state.spec.cutSideM / state.spec.nx;
    expect(maxParticleTrailSegmentM(particles, 50)).toBeLessThan(cellM * 3.5);
  });

  it("deflects around a single block without parking inside the obstacle", () => {
    const spec = windLbmGridSpec(100, 96);
    const obstacle = singleBlockObstacle(spec.nx, spec.ny, 14, 22);
    const inflow = inflowFromDirectionDeg(270, speedLuFromKmh(18));
    const state = createLbmState(spec, obstacle, inflow);
    lbmStepMany(state, 260);
    expect(postObstacleSpeedDrop(state)).toBeGreaterThan(0.002);
    const particles = spawnWindParticles(600, 100, 11);
    for (let i = 0; i < particles.length; i++) {
      particles[i]!.east = -42 + (i % 30) * 2.2;
      particles[i]!.north = (Math.floor(i / 30) - 10) * 2.4;
    }
    for (let s = 0; s < 220; s++) advectWindParticles(particles, state, 0.033, 100);
    const cellFor = (p: { east: number; north: number }) => {
      const half = 50;
      const fx = ((p.east + half) / 100) * spec.nx;
      const fy = ((p.north + half) / 100) * spec.ny;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      return i + j * spec.nx;
    };
    let onObstacle = 0;
    let farWakeLowSpeed = 0;
    for (const p of particles) {
      if (state.obstacle[cellFor(p)]) onObstacle++;
      if (p.east > 6 && p.east < 28 && Math.abs(p.north) < 6) {
        const f = Math.hypot(p.lastUx, p.lastUy);
        if (f < 0.04) farWakeLowSpeed++;
      }
    }
    expect(onObstacle).toBe(0);
    expect(farWakeLowSpeed).toBeGreaterThan(3);
    const spread = particles.filter((p) => p.east > -24 && p.east < -6 && Math.abs(p.north) > 5).length;
    expect(spread).toBeGreaterThan(15);
  });
});
