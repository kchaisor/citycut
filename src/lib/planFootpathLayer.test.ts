import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MultiPolygon } from "polygon-clipping";
import { PATH_WIDTH_M } from "./lineweights";
import { clearCentrelineCacheForTests } from "./centrelineSmooth";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { planPaths } from "./svgPlan";
import { openRing, signedArea } from "./geo";

const jolimontPath = "/opt/cursor/artifacts/jolimont-model.json";

function multiArea(multi: MultiPolygon): number {
  let total = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (!outer) continue;
    total += Math.abs(signedArea(openRing(outer)));
    for (const hole of polygon.slice(1)) {
      total -= Math.abs(signedArea(openRing(hole)));
    }
  }
  return total;
}

describe("plan footpath layer", () => {
  it("keeps green below roads (no green-on-road overlay)", () => {
    let model;
    try {
      model = JSON.parse(readFileSync(jolimontPath, "utf8"));
    } catch {
      return;
    }
    clearFootpathUnionCacheForTests();
    const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
    expect(plan.greenOnRoad.length).toBe(0);
    expect(plan.green.length).toBeGreaterThan(0);
    expect(multiArea(plan.pathFill)).toBeGreaterThan(1000);
  });

  it("keeps smooth footpath area near fast (main-style) on the east fixture", () => {
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw);
    clearFootpathUnionCacheForTests();
    clearCentrelineCacheForTests();
    const baseline = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
      pathFilletM: 2,
      smoothOutput: false,
      centrelineSmooth: false,
    });
    clearFootpathUnionCacheForTests();
    clearCentrelineCacheForTests();
    const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
      pathFilletM: 2,
      smoothOutput: true,
      centrelineSmooth: true,
    });
    const baseArea = multiArea(baseline.pathFill);
    const area = multiArea(plan.pathFill);
    expect(Math.abs(area - baseArea) / baseArea).toBeLessThanOrEqual(0.065);
  });
});
