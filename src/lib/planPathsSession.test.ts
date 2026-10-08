import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CityModel } from "../types";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { sitePlanChunksForExport } from "./aiPlan";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import {
  beginBackgroundSmoothPlan,
  buildFastPlanPaths,
  buildSmoothPlanPaths,
  ensureSmoothPlanPaths,
  planFillVertexCount,
  planModelCutToken,
  planPathsFromSiteStyle,
  resetPlanPathsSessionForTests,
} from "./planPathsSession";
import { cityModelTo3dm } from "./rhinoExport";

function square(minX: number, minY: number, maxX: number, maxY: number) {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ] as [number, number][];
}

function testModel(sideM = 100): CityModel {
  return {
    placeLabel: "Progressive plan test",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    blocks: [],
    roads: [
      { id: 1, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" },
      { id: 2, line: [[-30, -20], [30, -20]], width: 2, kind: "road", grade: "path" },
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
  });

  it("export awaits smooth geometry when background job is in flight", async () => {
    const model = testModel();
    const request = planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES);
    clearFootpathUnionCacheForTests();
    const background = beginBackgroundSmoothPlan(request);
    clearFootpathUnionCacheForTests();
    const exported = await ensureSmoothPlanPaths(request);
    const fromBackground = await background;
    expect(planFillVertexCount(exported)).toBe(planFillVertexCount(fromBackground));
    expect(planFillVertexCount(exported)).toBeGreaterThan(planFillVertexCount(buildFastPlanPaths(request)));
  });

  it("site plan export chunks use smooth fills", async () => {
    const model = testModel();
    clearFootpathUnionCacheForTests();
    const fastVerts = planFillVertexCount(buildFastPlanPaths(planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES)));
    clearFootpathUnionCacheForTests();
    beginBackgroundSmoothPlan(planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES));
    const chunks = await sitePlanChunksForExport(model, 1000, DEFAULT_LINE_STYLES);
    clearFootpathUnionCacheForTests();
    const smoothVerts = planFillVertexCount(
      buildSmoothPlanPaths(planPathsFromSiteStyle(model, 1000, DEFAULT_LINE_STYLES)),
    );
    const roads = chunks.find((c) => c.name === "Roads");
    expect(roads?.paths?.length).toBeGreaterThan(0);
    const roadPath = roads!.paths![0];
    const roadRingPts = roadPath?.rings?.[0]?.length ?? 0;
    expect(roadRingPts).toBeGreaterThan(0);
    expect(smoothVerts).toBeGreaterThan(fastVerts);
  });

  it("replaces in-flight smooth job when cut token changes", async () => {
    const reqA = planPathsFromSiteStyle(testModel(100), 1000, DEFAULT_LINE_STYLES);
    const reqB = planPathsFromSiteStyle(testModel(120), 1000, DEFAULT_LINE_STYLES);
    expect(planModelCutToken(reqA.model)).not.toBe(planModelCutToken(reqB.model));
    beginBackgroundSmoothPlan(reqA);
    const jobB = beginBackgroundSmoothPlan(reqB);
    const fromExport = await ensureSmoothPlanPaths(reqB);
    expect(fromExport.roadFill).toEqual((await jobB).roadFill);
  });

  it("rhino export awaits smooth plan pipeline before building", async () => {
    const model = testModel();
    const smoothSpy = vi.spyOn(
      await import("./planPathsSession"),
      "ensureSmoothPlanPaths",
    );
    try {
      await cityModelTo3dm(model);
      expect(smoothSpy).toHaveBeenCalledTimes(1);
    } finally {
      smoothSpy.mockRestore();
    }
  });
});
