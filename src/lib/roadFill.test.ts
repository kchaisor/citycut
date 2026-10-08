import { describe, expect, it } from "vitest";
import type { MultiPolygon, Pair } from "polygon-clipping";
import {
  clearFootpathUnionCacheForTests,
  isVehicularRoad,
  unionCarriageways,
  unionFootpaths,
  unionRoadSurface,
} from "./roadFill";
import type { Pt, RoadFeat } from "../types";

function openRing(ring: Pair[]): Pair[] {
  if (
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  ) {
    return ring.slice(0, -1);
  }
  return ring;
}

function inside(multi: MultiPolygon, x: number, y: number): boolean {
  let hits = 0;
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = openRing(ring);
      for (let i = 0, j = open.length - 1; i < open.length; j = i++) {
        const yi = open[i][1];
        const yj = open[j][1];
        if (yi > y === yj > y) continue;
        const xCross = ((open[j][0] - open[i][0]) * (y - yi)) / (yj - yi) + open[i][0];
        if (x < xCross) hits += 1;
      }
    }
  }
  return hits % 2 === 1;
}

/** An internal seam has the fill on both sides of an edge. A real kerb does not. */
function hasInternalSeam(multi: MultiPolygon): boolean {
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = openRing(ring);
      for (let i = 0; i < open.length; i++) {
        const a = open[i];
        const b = open[(i + 1) % open.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) continue;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const nx = (-dy / length) * 0.25;
        const ny = (dx / length) * 0.25;
        if (inside(multi, mx + nx, my + ny) === inside(multi, mx - nx, my - ny)) return true;
      }
    }
  }
  return false;
}

function circle(radius: number, segments = 16): Pair[] {
  const points: Pair[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

describe("isVehicularRoad", () => {
  it("keeps carriageways and drops paths and rail", () => {
    const path: RoadFeat = { id: 1, line: [[0, 0], [10, 0]], width: 2, kind: "road", grade: "path" };
    const local: RoadFeat = { id: 2, line: [[0, 0], [10, 0]], width: 6, kind: "road", grade: "local" };
    const rail: RoadFeat = { id: 3, line: [[0, 0], [10, 0]], width: 3, kind: "rail" };
    expect(isVehicularRoad(path)).toBe(false);
    expect(isVehicularRoad(local)).toBe(true);
    expect(isVehicularRoad(rail)).toBe(false);
  });
});

describe("footpath fillet", () => {
  it("keeps straight footpath edges smooth while filling concave junction corners", () => {
    clearFootpathUnionCacheForTests();
    const line: Pt[] = [
      [-40, 0],
      [40, 0],
    ];
    const straight = unionFootpaths([line], 1.2, 200, "square", 2);
    const ring = straight.polygons[0]?.[0]?.slice(0, -1) ?? [];
    expect(ring.length).toBeLessThan(24);
    let maxEdge = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      maxEdge = Math.max(maxEdge, Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    expect(maxEdge).toBeGreaterThan(10);
  });

  it("filletes inner corners where two bands cross into one merged polygon", () => {
    clearFootpathUnionCacheForTests();
    const cross: Pt[][] = [
      [
        [-30, 0],
        [30, 0],
      ],
      [
        [0, -30],
        [0, 30],
      ],
    ];
    const sharp = unionFootpaths(cross, 1.2, 200, "square", 0);
    expect(sharp.polygons).toHaveLength(1);
    expect(inside(sharp.polygons, 0.7, 0.7)).toBe(false);

    clearFootpathUnionCacheForTests();
    const filleted = unionFootpaths(cross, 1.2, 200, "square", 2);
    expect(filleted.polygons).toHaveLength(1);
    expect(inside(filleted.polygons, 0.7, 0.7)).toBe(true);
    expect(hasInternalSeam(filleted.polygons)).toBe(false);
  });
});

describe("road union", () => {
  it("joins a crossing, a bend, and a cul-de-sac into one shape with no internal seams", () => {
    const fill = unionCarriageways(
      [
        { line: [[-30, 0], [30, 0]], width: 8 },
        { line: [[0, -30], [0, 30]], width: 8 },
        { line: [[30, 0], [30, 24]], width: 8 },
        { line: [[18, 24], [46, 24]], width: 6 },
      ],
      200,
    );
    expect(fill.polygons).toHaveLength(1);
    expect(fill.polygons[0].slice(1)).toHaveLength(0);
    expect(inside(fill.polygons, 0, 0)).toBe(true);
    expect(inside(fill.polygons, 30, 12)).toBe(true);
    expect(inside(fill.polygons, 32, 24)).toBe(true);
    expect(inside(fill.polygons, 20, 10)).toBe(false);
    expect(inside(fill.polygons, 46 + 2, 24)).toBe(true);
    expect(inside(fill.polygons, 46 + 5, 24)).toBe(false);
    expect(hasInternalSeam(fill.polygons)).toBe(false);
  });

  it("keeps a roundabout island as a hole and still has no seam where a road joins", () => {
    const fill = unionCarriageways(
      [
        { line: circle(18), width: 6 },
        { line: [[18, 0], [40, 0]], width: 6 },
      ],
      200,
    );
    expect(fill.polygons).toHaveLength(1);
    expect(fill.polygons[0].length).toBeGreaterThan(1);
    expect(inside(fill.polygons, 0, 0)).toBe(false);
    expect(inside(fill.polygons, 18, 0)).toBe(true);
    expect(inside(fill.polygons, 30, 0)).toBe(true);
    expect(hasInternalSeam(fill.polygons)).toBe(false);
  });

  it("fills a dual-carriageway median gap and keeps tram dashes separate from the fill union", () => {
    const roads: RoadFeat[] = [
      { id: 1, line: [[-40, 0], [40, 0]], width: 10, kind: "road", grade: "arterial" },
      { id: 2, line: [[-40, 12], [40, 12]], width: 10, kind: "road", grade: "arterial" },
    ];
    const bare = unionCarriageways(
      roads.map((road) => ({ line: road.line, width: road.width })),
      200,
    );
    expect(inside(bare.polygons, 0, 6)).toBe(false);
    const filled = unionRoadSurface(roads, [[[-40, 6], [40, 6]]], 200);
    expect(inside(filled.polygons, 0, 6)).toBe(true);
    expect(hasInternalSeam(filled.polygons)).toBe(false);
  });

  it("buffers a footpath 0.6 m each side of the centreline and unions a join", () => {
    const single = unionFootpaths([[[0, 0], [40, 0]]], 1.2, 200);
    expect(inside(single.polygons, 20, 0.5)).toBe(true);
    expect(inside(single.polygons, 20, -0.5)).toBe(true);
    expect(inside(single.polygons, 20, 0.8)).toBe(false);
    expect(inside(single.polygons, 20, -0.8)).toBe(false);
    const joined = unionFootpaths(
      [
        [[0, 0], [40, 0]],
        [[20, -20], [20, 20]],
      ],
      1.2,
      200,
    );
    expect(joined.polygons).toHaveLength(1);
    expect(inside(joined.polygons, 20, 0)).toBe(true);
    expect(hasInternalSeam(joined.polygons)).toBe(false);
    expect(unionFootpaths([[[0, 0], [40, 0]]], 0, 200).polygons).toHaveLength(0);
  });
});
