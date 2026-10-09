import { beforeEach, describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { runSmoothPlanWorkerJob } from "./smoothPlanCompute";
import { computeSmoothPlanPaths } from "./smoothPlanCompute";
import { buildSmoothPlanPathsInWorker, terminateSmoothPlanWorkerForTests } from "./smoothPlanWorkerClient";
import { planPathsFromSiteStyle, resetPlanPathsSessionForTests } from "./planPathsSession";
import type { PlanPaths } from "./svgPlan";

function stripTiming(plan: PlanPaths): Omit<PlanPaths, "roadUnionMs" | "pathUnionMs" | "ringSmoothMs"> {
  const { roadUnionMs: _r, pathUnionMs: _p, ringSmoothMs: _s, ...geometry } = plan;
  return geometry;
}

function testModel(): CityModel {
  return {
    placeLabel: "Worker test",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    blocks: [],
    roads: [
      { id: 1, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" },
      { id: 2, line: [[-30, -20], [30, -20]], width: 2, kind: "road", grade: "path" },
    ],
    areas: [],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

describe("smooth plan worker", () => {
  beforeEach(() => {
    clearFootpathUnionCacheForTests();
    resetPlanPathsSessionForTests();
    terminateSmoothPlanWorkerForTests();
  });

  it("worker job matches synchronous smooth build byte-for-byte on geometry", () => {
    const request = planPathsFromSiteStyle(testModel(), 1000, DEFAULT_LINE_STYLES);
    clearFootpathUnionCacheForTests();
    const sync = computeSmoothPlanPaths(request);
    clearFootpathUnionCacheForTests();
    const fromWorkerJob = runSmoothPlanWorkerJob(request);
    expect(stripTiming(fromWorkerJob)).toEqual(stripTiming(sync));
  });

  it("buildSmoothPlanPathsInWorker matches sync (fallback path in Vitest)", async () => {
    const request = planPathsFromSiteStyle(testModel(), 1000, DEFAULT_LINE_STYLES);
    clearFootpathUnionCacheForTests();
    const sync = computeSmoothPlanPaths(request);
    clearFootpathUnionCacheForTests();
    const fromClient = await buildSmoothPlanPathsInWorker(request);
    expect(stripTiming(fromClient)).toEqual(stripTiming(sync));
  });
});
