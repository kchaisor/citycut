import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PATH_WIDTH_M } from "./lineweights";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { openRing, signedArea } from "./geo";
import { planPaths } from "./svgPlan";
import type { MultiPolygon } from "polygon-clipping";
import {
  countConcaveArcRunsMulti,
  PLAN_RING_SMOOTH_MAX_DEVIATION_M,
  quarterCircleFilletRing,
  smoothPlanMultiPolygon,
  smoothPlanRing,
} from "./planRingSmooth";

function openVerts(ring: ReturnType<typeof quarterCircleFilletRing>): [number, number][] {
  return ring.slice(0, -1).map((p) => [p[0], p[1]]);
}

function maxTurnDeg(open: [number, number][]): number {
  const n = open.length;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const prev = open[(i + n - 1) % n]!;
    const curr = open[i]!;
    const next = open[(i + 1) % n]!;
    const ax = curr[0] - prev[0];
    const ay = curr[1] - prev[1];
    const bx = next[0] - curr[0];
    const by = next[1] - curr[1];
    const cross = ax * by - ay * bx;
    const dot = ax * bx + ay * by;
    max = Math.max(max, (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI);
  }
  return max;
}

function distToCircle(p: [number, number], r: number): number {
  return Math.abs(Math.hypot(p[0], p[1]) - r);
}

describe("planRingSmooth", () => {
  it("refits a quarter-circle fillet with at least as many vertices and smaller turns", () => {
    const inputRing = quarterCircleFilletRing(2, 4);
    const inputOpen = openVerts(inputRing);
    const inputArcVerts = inputOpen.filter((p) => p[0] > 0.05 && p[1] > 0.05);
    const smoothed = smoothPlanRing(inputRing);
    const outOpen = openVerts(smoothed);
    const outArcVerts = outOpen.filter((p) => p[0] > 0.05 && p[1] > 0.05);
    expect(outArcVerts.length).toBeGreaterThanOrEqual(Math.max(4, inputArcVerts.length));
    for (const p of outArcVerts) {
      expect(distToCircle(p, 2)).toBeLessThanOrEqual(PLAN_RING_SMOOTH_MAX_DEVIATION_M + 0.02);
    }
    expect(maxTurnDeg(outOpen)).toBeLessThan(maxTurnDeg(inputOpen));
  });

  it("keeps east footpath area within 0.5% and concave arc run count on faceted output", () => {
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw);
    clearFootpathUnionCacheForTests();
    const before = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: false });
    const smoothedFill = smoothPlanMultiPolygon(before.pathFill);
    const multiArea = (mp: MultiPolygon) => {
      let total = 0;
      for (const polygon of mp) {
        const outer = polygon[0];
        if (!outer) continue;
        total += Math.abs(signedArea(openRing(outer)));
      }
      return total;
    };
    const baseA = multiArea(before.pathFill);
    const smoothA = multiArea(smoothedFill);
    expect(Math.abs(smoothA - baseA) / baseA).toBeLessThanOrEqual(0.005);
    const arcRunsBefore = countConcaveArcRunsMulti(before.pathFill);
    const arcRunsSmooth = countConcaveArcRunsMulti(smoothedFill);
    expect(arcRunsSmooth).toBeGreaterThanOrEqual(Math.floor(arcRunsBefore * 0.97));
  });
});
