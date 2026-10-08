// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import type { CityModel } from "../types";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { planFillVertexCount, resetPlanPathsSessionForTests } from "./planPathsSession";
import { useProgressivePlanPaths } from "./useProgressivePlanPaths";

function testModel(sideM: number): CityModel {
  return {
    placeLabel: "Hook test",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM,
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

const model100 = testModel(100);
const model200 = testModel(200);

describe("useProgressivePlanPaths", () => {
  beforeEach(() => {
    clearFootpathUnionCacheForTests();
    resetPlanPathsSessionForTests();
  });

  it("does not swap smooth geometry from a previous cut after the model changes", async () => {
    const { result, rerender } = renderHook(
      ({ model }: { model: CityModel }) =>
        useProgressivePlanPaths(
          {
            model,
            pathWidthM: DEFAULT_LINE_STYLES.pathWidthM,
            contourIndexEvery: DEFAULT_LINE_STYLES.contourIndexEvery,
            planScale: 1000,
            coarseIntervalM: DEFAULT_LINE_STYLES.contourCoarseIntervalM,
            coarseFromScale: DEFAULT_LINE_STYLES.contourCoarseFromScale,
            planOptions: { pathFilletM: DEFAULT_LINE_STYLES.pathFilletM },
          },
          true,
        ),
      { initialProps: { model: model100 } },
    );

    rerender({ model: model200 });
    const fastAfterCut = planFillVertexCount(result.current);

    await waitFor(
      () => {
        expect(planFillVertexCount(result.current)).toBeGreaterThan(fastAfterCut);
      },
      { timeout: 15_000 },
    );

    const outer = result.current.roadFill[0]?.[0];
    for (const [east] of outer ?? []) {
      expect(Math.abs(east)).toBeLessThanOrEqual(100);
    }
  });
});
