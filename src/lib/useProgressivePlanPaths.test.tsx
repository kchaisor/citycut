// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { CityModel } from "../types";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import * as planPathsSession from "./planPathsSession";
import { buildSmoothPlanPaths, planPathsFromSiteStyle, resetPlanPathsSessionForTests } from "./planPathsSession";
import { useProgressivePlanPaths } from "./useProgressivePlanPaths";

function testModel(pathNorthM: number): CityModel {
  return {
    placeLabel: "Hook test",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    blocks: [],
    roads: [
      { id: 1, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" },
      { id: 2, line: [[-30, pathNorthM], [30, pathNorthM]], width: 2, kind: "road", grade: "path" },
    ],
    areas: [],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

const cutA = testModel(-20);
const cutB = testModel(22);

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
    clearFootpathUnionCacheForTests();
    resetPlanPathsSessionForTests();
  });

  it("does not run a synchronous smooth build on first paint when progressive mode is on", () => {
    const smoothSpy = vi.spyOn(planPathsSession, "buildSmoothPlanPaths");
    try {
      renderHook(() => useProgressivePlanPaths(hookRequest(cutA), true));
      expect(smoothSpy).not.toHaveBeenCalled();
    } finally {
      smoothSpy.mockRestore();
    }
  });

  it("never shows the previous cut's road fill when counts and centre match but geometry differs", async () => {
    const { result, rerender } = renderHook(
      ({ model }: { model: CityModel }) => useProgressivePlanPaths(hookRequest(model), true),
      { initialProps: { model: cutA } },
    );

    const roadFillCutA = structuredClone(result.current.roadFill);
    rerender({ model: cutB });

    expect(result.current.roadFill).not.toEqual(roadFillCutA);

    const smoothB = buildSmoothPlanPaths(planPathsFromSiteStyle(cutB, 1000, DEFAULT_LINE_STYLES));
    await waitFor(
      () => {
        expect(result.current.roadFill).toEqual(smoothB.roadFill);
      },
      { timeout: 15_000 },
    );
    expect(result.current.roadFill).not.toEqual(roadFillCutA);
  });
});
