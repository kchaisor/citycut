import { describe, expect, it } from "vitest";
import type { MultiPolygon, Pair } from "polygon-clipping";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { planPaths } from "./svgPlan";
import { PATH_WIDTH_M } from "./lineweights";
import type { CityModel } from "../types";

function fixtureModel(): CityModel {
  const path = fileURLToPath(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as CityModel;
}

function multiArea(multi: MultiPolygon): number {
  let area = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (!outer) continue;
    area += ringArea(outer);
    for (const hole of polygon.slice(1)) area -= ringArea(hole);
  }
  return area;
}

function ringArea(ring: Pair[]): number {
  const open = ring.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < open.length; i++) {
    const [x1, y1] = open[i]!;
    const [x2, y2] = open[(i + 1) % open.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function inPolygon(polygon: MultiPolygon[0], x: number, y: number): boolean {
  function inRing(ring: Pair[]): boolean {
    const open = ring.slice(0, -1);
    let hits = 0;
    for (let i = 0, j = open.length - 1; i < open.length; j = i++) {
      const yi = open[i]![1];
      const yj = open[j]![1];
      if (yi > y === yj > y) continue;
      const xc = ((open[j]![0] - open[i]![0]) * (y - yi)) / (yj - yi) + open[i]![0];
      if (x < xc) hits++;
    }
    return hits % 2 === 1;
  }
  if (!inRing(polygon[0]!)) return false;
  for (const hole of polygon.slice(1)) if (inRing(hole)) return false;
  return true;
}

function inMulti(multi: MultiPolygon, x: number, y: number): boolean {
  for (const polygon of multi) if (inPolygon(polygon, x, y)) return true;
  return false;
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function minDistToUnclosedFootpath(multi: MultiPolygon, x: number, y: number): number {
  let best = Infinity;
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = ring.slice(0, -1);
      for (let i = 0; i < open.length; i++) {
        const a = open[i]!;
        const b = open[(i + 1) % open.length]!;
        best = Math.min(best, distPointToSegment(x, y, a[0], a[1], b[0], b[1]));
      }
    }
  }
  return best;
}

describe("east melbourne path fixture", () => {
  it("keeps path and road area near un-filleted plan and does not flood beyond the close radius", () => {
    const model = fixtureModel();
    clearFootpathUnionCacheForTests();
    const sharp = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 0 });
    clearFootpathUnionCacheForTests();
    const filleted = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });

    const pathSharp = multiArea(sharp.pathFill);
    const pathFil = multiArea(filleted.pathFill);
    const roadSharp = multiArea(sharp.roadFill);
    const roadFil = multiArea(filleted.roadFill);

    expect(pathFil).toBeGreaterThan(pathSharp * 0.85);
    expect(pathFil).toBeLessThan(pathSharp * 1.15);
    expect(roadFil).toBeGreaterThan(roadSharp * 0.92);
    expect(roadFil).toBeLessThan(roadSharp * 1.08);

    const r = 2;
    const slack = 0.1;
    let violations = 0;
    for (let x = -100; x <= 400; x += 8) {
      for (let y = -60; y <= 300; y += 8) {
        if (!inMulti(filleted.pathFill, x, y)) continue;
        if (inMulti(sharp.pathFill, x, y)) continue;
        if (minDistToUnclosedFootpath(sharp.pathFill, x, y) <= r + slack) continue;
        violations++;
      }
    }
    expect(violations).toBe(0);
  });
});
