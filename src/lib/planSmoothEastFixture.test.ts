import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon } from "polygon-clipping";
import { openRing, signedArea } from "./geo";
import { PATH_WIDTH_M } from "./lineweights";
import { KELVIN_CROPS, steepTurnVertexCount } from "./test/planSmoothMetrics";
import {
  clearAllRoadFillCachesForTests,
  unionRoadSurfaceForPlanSmooth,
  type PlanFillQuality,
} from "./roadFill";
import { planPaths } from "./svgPlan";
import type { CityModel } from "../types";

const { union, difference } = polygonClipping as {
  union: (a: MultiPolygon, b: MultiPolygon) => MultiPolygon;
  difference: (a: MultiPolygon, b: MultiPolygon) => MultiPolygon;
};

function multiArea(multi: MultiPolygon): number {
  let total = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (!outer) continue;
    total += Math.abs(signedArea(openRing(outer)));
    for (const hole of polygon.slice(1)) total -= Math.abs(signedArea(openRing(hole)));
  }
  return total;
}

function planSeamGapM2(model: CityModel, quality: PlanFillQuality): number {
  clearAllRoadFillCachesForTests();
  const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
    pathFilletM: 2,
    quality,
  });
  const roadUnion = unionRoadSurfaceForPlanSmooth(
    model.roads,
    model.tramLines,
    model.sideM,
    model.frameShape ?? "square",
    quality,
  );
  const envelope = union(roadUnion.displayPolygons, plan.pathFill);
  const painted = union(plan.roadFill, plan.pathFill);
  try {
    return multiArea(difference(envelope, painted));
  } catch {
    return Infinity;
  }
}

describe("east melbourne path-trim smooth guards", () => {
  const PLAN_TIMEOUT_MS = 120_000;
  const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
  const model = JSON.parse(raw) as CityModel;

  afterEach(() => {
    clearAllRoadFillCachesForTests();
  });

  it("facet-spot and path-kink have at most two steep turns on smooth fills", { timeout: PLAN_TIMEOUT_MS }, () => {
    clearAllRoadFillCachesForTests();
    const smooth = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
      pathFilletM: 2,
      quality: "smooth",
    });
    const facetVb = KELVIN_CROPS["facet-spot"]!;
    const kinkVb = KELVIN_CROPS["path-kink"]!;
    const facetTurns =
      steepTurnVertexCount(smooth.roadFill, facetVb) + steepTurnVertexCount(smooth.pathFill, facetVb);
    const kinkTurns =
      steepTurnVertexCount(smooth.roadFill, kinkVb) + steepTurnVertexCount(smooth.pathFill, kinkVb);
    expect(facetTurns).toBeLessThanOrEqual(2);
    expect(kinkTurns).toBeLessThanOrEqual(2);
  });

  it("smooth seam gap does not exceed main-style fast plan", { timeout: PLAN_TIMEOUT_MS }, () => {
    const mainGap = planSeamGapM2(model, "fast");
    const smoothGap = planSeamGapM2(model, "smooth");
    expect(smoothGap).toBeLessThanOrEqual(mainGap + 0.01);
  });
});
