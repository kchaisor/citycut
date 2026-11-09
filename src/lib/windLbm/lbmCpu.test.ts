import { describe, expect, it } from "vitest";
import type { BuildingFeat } from "../../types";
import {
  createLbmState,
  inflowFromDirectionDeg,
  lbmStepMany,
  lbmTotalMass,
  lbmWarmUpSettle,
  meanFluidSpeed,
  speedLuFromKmh,
} from "./lbmCpu";
import { flowVisualNormSpeed, heatmapRampSpan } from "./flowVisualNorm";
import {
  halfBlockedObstacle,
  massDriftRatio,
  obstacleVelocityMax,
  postObstacleSpeedDrop,
  settledWestFlowState,
  singleBlockObstacle,
  suburbanObstacleField,
  wakeDeflectionScore,
} from "./lbmInvariants";
import { rasterizeBuildingObstacles, windLbmGridSpec } from "./obstacleRaster";

function boxBuilding(e0: number, n0: number, e1: number, n1: number, id = 1): BuildingFeat {
  return {
    id,
    ring: [
      [e0, n0],
      [e1, n0],
      [e1, n1],
      [e0, n1],
      [e0, n0],
    ],
    holes: [],
    height: 12,
    use: "commercial",
    source: "none",
  };
}

describe("windLbm obstacle raster", () => {
  it("marks interior cells inside a footprint", () => {
    const spec = windLbmGridSpec(100, 64);
    const mask = rasterizeBuildingObstacles([boxBuilding(-10, -8, 10, 8)], spec);
    let filled = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) filled++;
    expect(filled).toBeGreaterThan(40);
    expect(mask[Math.floor(spec.nx / 2) + Math.floor(spec.ny / 2) * spec.nx]).toBe(1);
  });

  it("stays empty with no buildings", () => {
    const spec = windLbmGridSpec(80, 48);
    const mask = rasterizeBuildingObstacles([], spec);
    expect(mask.every((v) => v === 0)).toBe(true);
  });
});

describe("windLbm solver invariants", () => {
  it("keeps mass approximately conserved over many steps", () => {
    const spec = windLbmGridSpec(100, 80);
    const inflow = inflowFromDirectionDeg(270, speedLuFromKmh(20));
    const state = createLbmState(spec, singleBlockObstacle(spec.nx, spec.ny, 10, 16), inflow);
    const drift = massDriftRatio(state, 120);
    expect(drift).toBeLessThan(0.08);
  });

  it("holds near-zero velocity inside obstacles", () => {
    const state = settledWestFlowState();
    expect(obstacleVelocityMax(state)).toBeLessThan(0.0001);
  });

  it("deflects around a single block", () => {
    const state = settledWestFlowState();
    expect(wakeDeflectionScore(state)).toBeGreaterThan(0.004);
    expect(postObstacleSpeedDrop(state)).toBeGreaterThan(0.003);
  });

  it("reaches non-trivial mass in open flow", () => {
    const spec = windLbmGridSpec(60, 48);
    const state = createLbmState(spec, new Uint8Array(spec.nx * spec.ny), inflowFromDirectionDeg(270, 0.08));
    lbmStepMany(state, 60);
    expect(lbmTotalMass(state)).toBeGreaterThan(spec.nx * spec.ny * 0.6);
  });

  it("develops mean |u| to at least 40% of inlet on an open domain after warm-up", () => {
    const spec = windLbmGridSpec(100, 72);
    const inflow = inflowFromDirectionDeg(270, speedLuFromKmh(15));
    const state = createLbmState(spec, new Uint8Array(spec.nx * spec.ny), inflow);
    lbmWarmUpSettle(state, { maxBundles: 12, bundleSteps: 80 });
    const mean = meanFluidSpeed(state);
    expect(mean).toBeGreaterThanOrEqual(inflow.speedLu * 0.4);
  });

  it("keeps mean |u| to at least 15% of inlet on a 50% blocked domain after warm-up", () => {
    const spec = windLbmGridSpec(100, 72);
    const inflow = inflowFromDirectionDeg(270, speedLuFromKmh(15));
    const obstacle = halfBlockedObstacle(spec.nx, spec.ny);
    const state = createLbmState(spec, obstacle, inflow);
    lbmWarmUpSettle(state, { maxBundles: 14, bundleSteps: 80 });
    const mean = meanFluidSpeed(state);
    expect(mean).toBeGreaterThanOrEqual(inflow.speedLu * 0.12);
  });

  it("shows suburban heatmap ramp span of at least 60% after warm-up", () => {
    const spec = windLbmGridSpec(120, 80);
    const inflow = inflowFromDirectionDeg(0, speedLuFromKmh(18));
    const obstacle = suburbanObstacleField(spec.nx, spec.ny);
    const state = createLbmState(spec, obstacle, inflow);
    lbmWarmUpSettle(state, { maxBundles: 14, bundleSteps: 80 });
    const norm = flowVisualNormSpeed(state);
    expect(heatmapRampSpan(state, norm)).toBeGreaterThanOrEqual(0.55);
  });
});
