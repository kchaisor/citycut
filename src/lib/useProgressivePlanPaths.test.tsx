// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { CityModel, RoadFeat } from "../types";
import { clearAllRoadFillCachesForTests, unionRoadSurface } from "./roadFill";
import { hashMultiPolygon } from "./geometryHash";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import * as planPathsSession from "./planPathsSession";
import {
  buildSmoothPlanPaths,
  beginBackgroundSmoothPlan,
  ensureSmoothPlanPaths,
  planPathsFromSiteStyle,
  resetPlanPathsSessionForTests,
} from "./planPathsSession";
import { useProgressivePlanPaths } from "./useProgressivePlanPaths";

function crossingRoads(): RoadFeat[] {
  return [
    { id: 1, line: [[-50, 0], [50, 0]], width: 8, kind: "road", grade: "arterial" },
    { id: 2, line: [[0, -50], [0, 50]], width: 8, kind: "road", grade: "arterial" },
  ];
}

function parallelRoadsSameBounds(): RoadFeat[] {
  return [
    { id: 1, line: [[-50, -50], [50, -50]], width: 8, kind: "road", grade: "arterial" },
    { id: 2, line: [[-50, 50], [50, 50]], width: 8, kind: "road", grade: "arterial" },
  ];
}

function testModel(roads: RoadFeat[]): CityModel {
  return {
    placeLabel: "Hook test",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    blocks: [],
    roads,
    areas: [],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

const cutX = testModel(crossingRoads());
const cutP = testModel(parallelRoadsSameBounds());

const hookRequest = (model: CityModel) => ({
  model,
  pathWidthM: DEFAULT_LINE_STYLES.pathWidthM,
  contourIndexEvery: DEFAULT_LINE_STYLES.contourIndexEvery,
  planScale: 1000,
  coarseIntervalM: DEFAULT_LINE_STYLES.contourCoarseIntervalM,
  coarseFromScale: DEFAULT_LINE_STYLES.contourCoarseFromScale,
  planOptions: { pathFilletM: DEFAULT_LINE_STYLES.pathFilletM },
});

describe("useProgressivePlanPaths", () => {
  beforeEach(() => {
    clearAllRoadFillCachesForTests();
    resetPlanPathsSessionForTests();
  });

  it("does not run a synchronous smooth build on first paint when progressive mode is on", () => {
    const smoothSpy = vi.spyOn(planPathsSession, "buildSmoothPlanPaths");
    try {
      renderHook(() => useProgressivePlanPaths(hookRequest(cutX), true));
      expect(smoothSpy).not.toHaveBeenCalled();
    } finally {
      smoothSpy.mockRestore();
    }
  });

  it("never shows crossing-road geometry after a parallel cut with matching counts and bounds", async () => {
    clearAllRoadFillCachesForTests();
    const parallelFast = unionRoadSurface(cutP.roads, undefined, cutP.sideM, "square");
    clearAllRoadFillCachesForTests();
    const crossingFast = unionRoadSurface(cutX.roads, undefined, cutX.sideM, "square");
    expect(hashMultiPolygon(parallelFast.polygons)).not.toBe(hashMultiPolygon(crossingFast.polygons));

    const { result, rerender } = renderHook(
      ({ model }: { model: CityModel }) => useProgressivePlanPaths(hookRequest(model), true),
      { initialProps: { model: cutX } },
    );
    const roadFillCutX = structuredClone(result.current.roadFill);
    rerender({ model: cutP });

    expect(result.current.roadFill).not.toEqual(roadFillCutX);

    const smoothP = buildSmoothPlanPaths(planPathsFromSiteStyle(cutP, 1000, DEFAULT_LINE_STYLES));
    await waitFor(
      () => {
        expect(result.current.roadFill).toEqual(smoothP.roadFill);
      },
      { timeout: 15_000 },
    );
    expect(result.current.roadFill).not.toEqual(roadFillCutX);
  });

  it("export before the smooth swap still leaves display on smooth fills", async () => {
    const displayReq = planPathsFromSiteStyle(cutX, 1000, DEFAULT_LINE_STYLES);
    const exportReq = planPathsFromSiteStyle(cutX, 500, DEFAULT_LINE_STYLES);
    const expected = buildSmoothPlanPaths(displayReq);
    const { result } = renderHook(() => useProgressivePlanPaths(displayReq, true));
    await ensureSmoothPlanPaths(exportReq);
    await waitFor(
      () => {
        expect(result.current.roadFill).toEqual(expected.roadFill);
      },
      { timeout: 15_000 },
    );
  });

  it("display cut change during export still writes the export cut", async () => {
    const exportReq = planPathsFromSiteStyle(cutX, 500, DEFAULT_LINE_STYLES);
    const displayReqP = planPathsFromSiteStyle(cutP, 1000, DEFAULT_LINE_STYLES);
    const expectedExport = buildSmoothPlanPaths(exportReq);
    const exportPromise = ensureSmoothPlanPaths(exportReq);
    beginBackgroundSmoothPlan(displayReqP);
    const exported = await exportPromise;
    expect(exported.roadFill).toEqual(expectedExport.roadFill);
    expect(exported.pathFill).toEqual(expectedExport.pathFill);
  });
});
