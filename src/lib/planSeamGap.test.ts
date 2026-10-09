import { readFileSync } from "node:fs";
import * as polygonClipping from "polygon-clipping";
import { describe, expect, it } from "vitest";
import type { MultiPolygon } from "polygon-clipping";
import { openRing, signedArea } from "./geo";
import { PATH_WIDTH_M } from "./lineweights";
import { clearFootpathUnionCacheForTests, unionRoadSurface } from "./roadFill";
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

/** Uncovered sheet between morph-close road union and drawn fills (excludes median holes). */
function planSeamGapM2(model: CityModel): number {
  clearFootpathUnionCacheForTests();
  const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
    pathFilletM: 2,
    quality: "smooth",
  });
  const roadUnion = unionRoadSurface(model.roads, model.tramLines, model.sideM, model.frameShape ?? "square", "smooth");
  const envelope = union(roadUnion.displayPolygons, plan.pathFill);
  const painted = union(plan.roadFill, plan.pathFill);
  let gap = 0;
  try {
    gap = multiArea(difference(envelope, painted));
  } catch {
    gap = Infinity;
  }
  return gap;
}

describe("plan road/path seam gap", () => {
  it("smooth east melbourne trim has under 1 m² sheet between road union and fills", () => {
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw) as CityModel;
    expect(planSeamGapM2(model)).toBeLessThan(1);
  });
});
