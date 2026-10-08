import { describe, expect, it } from "vitest";
import type { MultiPolygon, Pair } from "polygon-clipping";
import {
  clearFootpathUnionCacheForTests,
  isVehicularRoad,
  stitchFootpathStrips,
  subtractFootpathBlockers,
  surfaceVerticesOutsideFrame,
  unionCarriageways,
  unionFootpathStrips,
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

function ringArea(ring: Pair[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function outerVertexCount(multi: MultiPolygon): number {
  let n = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (outer) n += outer.length;
  }
  return n;
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
  it("keeps a straight footpath band after morphological close", () => {
    clearFootpathUnionCacheForTests();
    const line: Pt[] = [
      [-40, 0],
      [40, 0],
    ];
    const straight = unionFootpaths([line], 2.4, 200, "square", 2);
    expect(inside(straight.polygons, 0, 0)).toBe(true);
    expect(inside(straight.polygons, 30, 0)).toBe(true);
    expect(straight.polygons[0]?.[0]?.length ?? 0).toBeGreaterThan(6);
  });

  it("morphological close on a crossing stays one region without internal seams", () => {
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
    const filleted = unionFootpaths(cross, 1.2, 200, "square", 2);
    expect(filleted.polygons).toHaveLength(1);
    expect(hasInternalSeam(filleted.polygons)).toBe(false);
  });

  it("uses at least one band width as fillet radius on wide strips", () => {
    clearFootpathUnionCacheForTests();
    const tee: Pt[][] = [
      [
        [-30, 8],
        [30, 8],
      ],
      [
        [0, 8],
        [0, -30],
      ],
    ];
    const narrow = unionFootpaths(tee, 1.2, 200, "square", 0.5);
    clearFootpathUnionCacheForTests();
    const wide = unionFootpaths(tee, 3, 200, "square", 0.5);
    expect(multiArea(wide.polygons)).toBeGreaterThan(multiArea(narrow.polygons));
  });

  it("stitches footpath ends that almost meet at a corner", () => {
    const stitched = stitchFootpathStrips(
      [
        { line: [[0, 0], [40, 0]], width: 2.4 },
        { line: [[40, 1.2], [40, -40]], width: 2.4 },
      ],
      1.75,
    );
    const joint = stitched[0]!.line[stitched[0]!.line.length - 1]!;
    expect(joint[0]).toBeCloseTo(stitched[1]!.line[0]![0], 5);
    expect(joint[1]).toBeCloseTo(stitched[1]!.line[0]![1], 5);
  });

  it("subtractFootpathBlockers removes fill pushed into a carriageway", () => {
    clearFootpathUnionCacheForTests();
    const tee: Pt[][] = [
      [
        [-30, 8],
        [30, 8],
      ],
      [
        [0, 8],
        [0, -30],
      ],
    ];
    const closed = unionFootpaths(tee, 2.4, 200, "square", 2);
    const road = unionCarriageways([{ line: [[-30, 0], [30, 0]], width: 10 }], 200);
    const trimmed = subtractFootpathBlockers(closed.polygons, road.polygons);
    expect(inside(trimmed, 0, 0)).toBe(false);
    expect(inside(trimmed, 0, 6.5)).toBe(true);
  });

  it("increases footpath area when closing concave junctions", () => {
    clearFootpathUnionCacheForTests();
    const tee: Pt[][] = [
      [
        [-30, 8],
        [30, 8],
      ],
      [
        [0, 8],
        [0, -30],
      ],
    ];
    const sharp = unionFootpaths(tee, 2.4, 200, "square", 0);
    clearFootpathUnionCacheForTests();
    const filleted = unionFootpaths(tee, 2.4, 200, "square", 2);
    expect(multiArea(filleted.polygons)).toBeGreaterThanOrEqual(multiArea(sharp.polygons));
  });

  it("filletes the concave pocket of a T junction", () => {
    clearFootpathUnionCacheForTests();
    const tee: Pt[][] = [
      [
        [-30, 8],
        [30, 8],
      ],
      [
        [0, 8],
        [0, -30],
      ],
    ];
    const sharp = unionFootpaths(tee, 2.4, 200, "square", 0);
    expect(inside(sharp.polygons, -2.1, 6.5)).toBe(false);
    clearFootpathUnionCacheForTests();
    const filleted = unionFootpaths(tee, 2.4, 200, "square", 2);
    expect(inside(filleted.polygons, 0, 6.5)).toBe(true);
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

  it("keeps dilated road fill inside the site frame", () => {
    const roads: RoadFeat[] = [
      { id: 1, line: [[-95, 92], [95, 92]], width: 12, kind: "road", grade: "arterial" },
      { id: 2, line: [[-92, -95], [-92, 95]], width: 12, kind: "road", grade: "arterial" },
      { id: 3, line: [[95, -95], [95, 95]], width: 12, kind: "road", grade: "arterial" },
    ];
    const fill = unionRoadSurface(roads, undefined, 200, "square");
    expect(surfaceVerticesOutsideFrame(fill.polygons, 200, "square")).toHaveLength(0);
  });

  it("keeps filleted footpaths inside the site frame", () => {
    clearFootpathUnionCacheForTests();
    const lines: Pt[][] = [
      [
        [-95, 0],
        [95, 0],
      ],
      [
        [0, -95],
        [0, 95],
      ],
    ];
    const fill = unionFootpaths(lines, 2.4, 200, "square", 2);
    expect(surfaceVerticesOutsideFrame(fill.polygons, 200, "square")).toHaveLength(0);
  });

  it("closes median gaps without widening straight road edges beyond 2%", () => {
    const road: RoadFeat = {
      id: 1,
      line: [
        [-40, 0],
        [40, 0],
      ],
      width: 10,
      kind: "road",
      grade: "arterial",
    };
    const bare = unionCarriageways([{ line: road.line, width: road.width }], 200);
    const surfaced = unionRoadSurface([road], undefined, 200, "square");
    expect(multiArea(surfaced.polygons)).toBeLessThanOrEqual(multiArea(bare.polygons) * 1.02);
    expect(multiArea(surfaced.polygons)).toBeGreaterThanOrEqual(multiArea(bare.polygons) * 0.98);
    const outerBare = openRing(bare.polygons[0]![0]!);
    const outerSurf = openRing(surfaced.polygons[0]![0]!);
    const devBare = Math.max(...outerBare.map((p) => Math.abs(p[1])));
    const devSurf = Math.max(...outerSurf.map((p) => Math.abs(p[1])));
    expect(devSurf).toBeLessThan(5.5);
    expect(Math.abs(devSurf - devBare)).toBeLessThan(0.15);
  });

  it("does not scallop straight road edges", () => {
    const road: RoadFeat = {
      id: 1,
      line: [
        [-40, 0],
        [40, 0],
      ],
      width: 10,
      kind: "road",
      grade: "arterial",
    };
    const surfaced = unionRoadSurface([road], undefined, 200, "square");
    const outer = openRing(surfaced.polygons[0]![0]!);
    const maxHalfWidth = Math.max(...outer.map((p) => Math.abs(p[1])));
    expect(Math.abs(maxHalfWidth - 5)).toBeLessThan(0.15);
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i]!;
      const b = outer[(i + 1) % outer.length]!;
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segLen < 20) continue;
      expect(Math.abs(a[1])).toBeLessThan(5.15);
      expect(Math.abs(b[1])).toBeLessThan(5.15);
    }
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
    function outerYExtents(multi: MultiPolygon) {
      let minY = Infinity;
      let maxY = -Infinity;
      for (const polygon of multi) {
        for (const p of openRing(polygon[0]!)) {
          minY = Math.min(minY, p[1]);
          maxY = Math.max(maxY, p[1]);
        }
      }
      return { minY, maxY };
    }
    const bareY = outerYExtents(bare.polygons);
    const filledY = outerYExtents(filled.polygons);
    expect(Math.abs(filledY.minY - bareY.minY)).toBeLessThan(0.11);
    expect(Math.abs(filledY.maxY - bareY.maxY)).toBeLessThan(0.11);
  });

  it("filleted footpath crossing has more area, more vertices, and rounded inside corners", () => {
    clearFootpathUnionCacheForTests();
    const len = 40;
    const angle = (75 * Math.PI) / 180;
    const strips = [
      { line: [[-len / 2, 0], [len / 2, 0]] as Pt[], width: 1.2 },
      {
        line: [
          [-Math.cos(angle) * (len / 2), -Math.sin(angle) * (len / 2)],
          [Math.cos(angle) * (len / 2), Math.sin(angle) * (len / 2)],
        ] as Pt[],
        width: 1.2,
      },
    ];
    const sharp = unionFootpathStrips(strips, 200, "square", 0, 1.2);
    clearFootpathUnionCacheForTests();
    const filleted = unionFootpathStrips(strips, 200, "square", 2, 1.2);
    expect(multiArea(filleted.polygons)).toBeGreaterThan(multiArea(sharp.polygons));
    expect(outerVertexCount(filleted.polygons)).toBeGreaterThan(outerVertexCount(sharp.polygons));
    const outer = openRing(filleted.polygons[0]![0]!);
    const nearCross = outer.filter((p) => Math.hypot(p[0], p[1]) < 2.5 && Math.hypot(p[0], p[1]) > 0.35);
    expect(nearCross.length).toBeGreaterThanOrEqual(4);
    const radii = nearCross.map((p) => Math.hypot(p[0], p[1])).sort((a, b) => a - b);
    expect(radii[radii.length - 1]! - radii[0]!).toBeGreaterThan(0.15);
  });

  it("buffers a footpath 0.6 m each side of the centreline and unions a join", () => {
    const single = unionFootpaths([[[0, 0], [40, 0]]], 1.2, 200, "square", 0);
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
      "square",
      0,
    );
    expect(joined.polygons).toHaveLength(1);
    expect(inside(joined.polygons, 20, 0)).toBe(true);
    expect(hasInternalSeam(joined.polygons)).toBe(false);
    expect(unionFootpaths([[[0, 0], [40, 0]]], 0, 200).polygons).toHaveLength(0);
  });
});
