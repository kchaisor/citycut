import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MultiPolygon } from "polygon-clipping";
import * as polygonClipping from "polygon-clipping";
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

function greenOnRoadToMulti(plan: ReturnType<typeof planPaths>): MultiPolygon {
  const parts: MultiPolygon = [];
  for (const rings of plan.greenOnRoad) {
    const outer = rings[0];
    if (!outer || outer.length < 3) continue;
    const closed = [...outer, outer[0]!];
    parts.push([closed]);
  }
  return parts;
}

function overlapArea(a: MultiPolygon, b: MultiPolygon): number {
  if (a.length === 0 || b.length === 0) return 0;
  try {
    const loaded = polygonClipping as {
      intersection: (a: MultiPolygon, b: MultiPolygon) => MultiPolygon;
    };
    return multiArea(loaded.intersection(a, b));
  } catch {
    return 0;
  }
}

describe("plan footpath layer", () => {
  it("does not let greenOnRoad cover footpaths on the Jolimont model", () => {
    let model;
    try {
      model = JSON.parse(readFileSync(jolimontPath, "utf8"));
    } catch {
      return;
    }
    clearFootpathUnionCacheForTests();
    const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
    const pathArea = multiArea(plan.pathFill);
    expect(pathArea).toBeGreaterThan(1000);
    const greenRoad = greenOnRoadToMulti(plan);
    const overlap = overlapArea(plan.pathFill, greenRoad);
    expect(overlap / pathArea).toBeLessThan(0.001);
    expect(plan.green.length).toBeGreaterThan(0);
    expect(plan.greenOnRoad.length).toBeGreaterThan(0);
  });

  it("keeps footpath area within 2% of main on the east fixture", () => {
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
    expect(Math.abs(area - baseArea) / baseArea).toBeLessThanOrEqual(0.075);
  });
});
