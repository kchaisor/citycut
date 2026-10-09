import { beforeEach, describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { COLOUR_FALLBACK } from "./colours";
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

function requestWithColours(model = testModel()) {
  const request = planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES);
  return { ...request, colourSnapshot: { ...COLOUR_FALLBACK, "--use-residential": "#FF00FF" } };
}

describe("smooth plan worker compute parity", () => {
  beforeEach(() => {
    clearFootpathUnionCacheForTests();
    resetPlanPathsSessionForTests();
    terminateSmoothPlanWorkerForTests();
  });

  it("in-process worker job matches sync smooth build on geometry", () => {
    const request = requestWithColours();
    clearFootpathUnionCacheForTests();
    const sync = computeSmoothPlanPaths(request);
    clearFootpathUnionCacheForTests();
    const fromWorkerJob = runSmoothPlanWorkerJob(request);
    expect(stripTiming(fromWorkerJob)).toEqual(stripTiming(sync));
  });

  it("client fallback path matches sync when Worker is unavailable in Vitest", async () => {
    const request = requestWithColours();
    clearFootpathUnionCacheForTests();
    const sync = computeSmoothPlanPaths(request);
    clearFootpathUnionCacheForTests();
    const fromClient = await buildSmoothPlanPathsInWorker(request);
    expect(stripTiming(fromClient)).toEqual(stripTiming(sync));
  });

});
