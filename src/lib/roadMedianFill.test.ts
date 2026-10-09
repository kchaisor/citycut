import { describe, expect, it } from "vitest";
import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon } from "polygon-clipping";
import { readFileSync } from "node:fs";
import { signedArea } from "./geo";
import { fillRoadMedianGaps } from "./roadMedianFill";
import { clearFootpathUnionCacheForTests, unionRoadSurface } from "./roadFill";
import { planPaths } from "./svgPlan";
import { PATH_WIDTH_M } from "./lineweights";
import type { CityModel, Pt } from "../types";

const pc = ((polygonClipping as unknown as { default?: typeof polygonClipping }).default ?? polygonClipping) as typeof polygonClipping;
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (multi: MultiPolygon) =>
  multi.reduce((sum, poly) => sum + poly.reduce((s, ring, i) => s + (i === 0 ? 1 : -1) * Math.abs(signedArea(ring.slice(0, -1) as Pt[])), 0), 0);
// 100 x 30 m carriageway with a 80 x 6 m median hole; the green strip is 80 x 3 m inside it.
const road: MultiPolygon = [[rect(0, 0, 100, 30), rect(10, 12, 90, 18)]];
const median = [rect(10, 13.5, 90, 16.5)];
const none = { green: [], water: [], paths: [], buildings: [] };

describe("fillRoadMedianGaps", () => {
  it("fills the paper halo around a median and keeps the green visible", () => {
    const out = fillRoadMedianGaps(road, { ...none, green: [median] });
    expect(area(out)).toBeCloseTo(3000 - 240, 3);
    expect(area(pc.intersection(out, [median]))).toBeCloseTo(0, 3);
  });
  it("fills a bare island hole completely", () => {
    expect(area(fillRoadMedianGaps(road, none))).toBeCloseTo(3000, 3);
  });
  it("keeps footpaths inside the hole uncovered", () => {
    const path = [rect(40, 12, 42, 18)];
    expect(area(pc.intersection(fillRoadMedianGaps(road, { ...none, paths: [path] }), [path]))).toBeCloseTo(0, 3);
  });
  it("leaves holes with buildings and large holes (city blocks) alone", () => {
    expect(fillRoadMedianGaps(road, { ...none, buildings: [[rect(50, 14, 52, 16)]] })).toEqual(road);
    // Several disjoint buildings in one hole must still keep it (not just their common overlap).
    expect(fillRoadMedianGaps(road, { ...none, buildings: [[rect(20, 14, 22, 16)], [rect(60, 14, 62, 16)]] })).toEqual(road);
    const block: MultiPolygon = [[rect(0, 0, 100, 100), rect(10, 10, 90, 90)]];
    expect(fillRoadMedianGaps(block, none)).toEqual(block);
  });
  it("never paints road over green on the East Melbourne fixture", () => {
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw) as CityModel;
    clearFootpathUnionCacheForTests();
    const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
    const carriageway = unionRoadSurface(model.roads, model.tramLines, model.sideM, model.frameShape ?? "square").polygons;
    const green = plan.green.map((rings) => rings.map((ring) => ring.map((p): [number, number] => [p[0], p[1]])));
    if (green.length === 0) return;
    const greenU = pc.union(green[0]!, ...green.slice(1));
    const before = area(pc.intersection(greenU, carriageway));
    const after = area(pc.intersection(greenU, plan.roadFill as MultiPolygon));
    expect(Math.abs(after - before)).toBeLessThan(0.5);
    expect(area(plan.roadFill as MultiPolygon)).toBeGreaterThanOrEqual(area(carriageway) - 0.5);
  });
});
