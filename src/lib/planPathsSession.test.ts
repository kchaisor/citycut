import { describe, expect, it, beforeEach } from "vitest";
import type { CityModel } from "../types";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { sitePlanChunks, sitePlanChunksForExport } from "./aiPlan";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import {
  beginBackgroundSmoothPlan,
  buildFastPlanPaths,
  buildSmoothPlanPaths,
  buildSmoothPlanPathsChunked,
  ensureSmoothPlanPaths,
  planFillVertexCount,
  planModelCutToken,
  planPathsFromSiteStyle,
  resetPlanPathsSessionForTests,
} from "./planPathsSession";

function square(minX: number, minY: number, maxX: number, maxY: number) {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ] as [number, number][];
}

function testModel(sideM = 100, roadYOffset = -20): CityModel {
  return {
    placeLabel: "Progressive plan test",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    blocks: [],
    roads: [
      { id: 1, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" },
      { id: 2, line: [[-30, roadYOffset], [30, roadYOffset]], width: 2, kind: "road", grade: "path" },
      { id: 3, line: [[10, -40], [10, 40]], width: 2, kind: "road", grade: "path" },
    ],
    areas: [{ id: 4, ring: square(-45, -45, 45, 45), holes: [], kind: "green" }],
    trees: [],
    roadKm: 0.2,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

describe("planPathsSession", () => {
  beforeEach(() => {
    clearFootpathUnionCacheForTests();
    resetPlanPathsSessionForTests();
  });

  it("fast and smooth fills differ on path/road junctions", () => {
    const model = testModel();
    const request = planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES);
    clearFootpathUnionCacheForTests();
    const fast = buildFastPlanPaths(request);
    clearFootpathUnionCacheForTests();
    const smooth = buildSmoothPlanPaths(request);
    expect(planFillVertexCount(smooth)).toBeGreaterThan(planFillVertexCount(fast));
    expect(smooth.roadFill).not.toEqual(fast.roadFill);
  });

  it("cut token distinguishes geometry with the same feature counts", () => {
    const a = testModel(100, -20);
    const b = testModel(100, 25);
    expect(a.roads.length).toBe(b.roads.length);
    expect(a.sideM).toBe(b.sideM);
    expect(planModelCutToken(a)).not.toBe(planModelCutToken(b));
  });

  it("export awaits smooth geometry when background job is in flight", async () => {
    const model = testModel();
    const request = planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES);
    clearFootpathUnionCacheForTests();
    const background = beginBackgroundSmoothPlan(request);
    clearFootpathUnionCacheForTests();
    const exported = await ensureSmoothPlanPaths(request);
    const fromBackground = await background;
    expect(exported.roadFill).toEqual(fromBackground.roadFill);
    expect(exported.pathFill).toEqual(fromBackground.pathFill);
    expect(exported.roadFill).not.toEqual(buildFastPlanPaths(request).roadFill);
  });

  it("site plan export chunks use smooth fills", async () => {
    const model = testModel();
    const request = planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES);
    clearFootpathUnionCacheForTests();
    const fast = buildFastPlanPaths(request);
    clearFootpathUnionCacheForTests();
    const smooth = buildSmoothPlanPaths(request);
    beginBackgroundSmoothPlan(request);
    const chunks = await sitePlanChunksForExport(model, 1000, DEFAULT_LINE_STYLES);
    const expectedRoads = sitePlanChunks(model, 1000, DEFAULT_LINE_STYLES, null, smooth).find(
      (chunk) => chunk.name === "Roads",
    );
    const exportedRoads = chunks.find((chunk) => chunk.name === "Roads");
    expect(exportedRoads).toEqual(expectedRoads);
    const fastRoads = sitePlanChunks(model, 1000, DEFAULT_LINE_STYLES, null, fast).find(
      (chunk) => chunk.name === "Roads",
    );
    expect(exportedRoads).not.toEqual(fastRoads);
  });

  it("chunked smooth build matches synchronous smooth plan", async () => {
    const model = testModel();
    const request = planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES);
    clearFootpathUnionCacheForTests();
    const sync = buildSmoothPlanPaths(request);
    clearFootpathUnionCacheForTests();
    const chunked = await buildSmoothPlanPathsChunked(request, () => true, 1_000_000);
    const stripTiming = (plan: typeof sync) => {
      const { roadUnionMs: _r, pathUnionMs: _p, ringSmoothMs: _s, ...geometry } = plan;
      return geometry;
    };
    expect(stripTiming(chunked!)).toEqual(stripTiming(sync));
  });

  it("replaces in-flight smooth job when cut token changes", async () => {
    const reqA = planPathsFromSiteStyle(testModel(100, -20), 1000, DEFAULT_LINE_STYLES);
    const reqB = planPathsFromSiteStyle(testModel(100, 30), 1000, DEFAULT_LINE_STYLES);
    expect(planModelCutToken(reqA.model)).not.toBe(planModelCutToken(reqB.model));
    beginBackgroundSmoothPlan(reqA);
    const jobB = beginBackgroundSmoothPlan(reqB);
    const fromExport = await ensureSmoothPlanPaths(reqB);
    expect(fromExport.roadFill).toEqual((await jobB).roadFill);
  });
});
