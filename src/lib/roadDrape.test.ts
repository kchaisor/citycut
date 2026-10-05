import { describe, expect, it } from "vitest";
import {
  maxTriangleEdge,
  refineSteepRoadTriangles,
  splitTriangle,
  subdivideToSpacing,
  type Tri,
} from "./roadDrape";

function oldSubdivideToSpacing(tris: Tri[], maxEdge: number): Tri[] {
  let current = tris;
  for (let level = 0; level < 8; level++) {
    const needsSplit = current.some(
      ([a, b, c]) =>
        Math.hypot(a[0] - b[0], a[1] - b[1]) > maxEdge ||
        Math.hypot(b[0] - c[0], b[1] - c[1]) > maxEdge ||
        Math.hypot(c[0] - a[0], c[1] - a[1]) > maxEdge,
    );
    if (!needsSplit) break;
    const next: Tri[] = [];
    for (const tri of current) next.push(...splitTriangle(tri, maxEdge));
    if (next.length > 24000) break;
    current = next;
  }
  return current;
}

describe("road drape subdivision", () => {
  it("refines only oversized triangles until every edge is within spacing", () => {
    const wide: Tri = [
      [-200, -15],
      [200, -15],
      [200, 15],
    ];
    const fine = subdivideToSpacing([wide], 5);
    expect(fine.length).toBeGreaterThan(10);
    expect(maxTriangleEdge(fine)).toBeLessThanOrEqual(5.01);
  });

  it("finishes densifying where the pre-fix 24k triangle cap stopped early", () => {
    const tris: Tri[] = [
      [
        [-500, -8],
        [500, -8],
        [500, 8],
      ],
      [
        [-500, -8],
        [500, 8],
        [-500, 8],
      ],
    ];
    const legacy = oldSubdivideToSpacing(tris, 4);
    const fine = subdivideToSpacing(tris, 4);
    expect(maxTriangleEdge(legacy)).toBeGreaterThan(4);
    expect(maxTriangleEdge(fine)).toBeLessThanOrEqual(4.01);
  });
});

describe("refineSteepRoadTriangles", () => {
  it("splits a triangle that spans a sharp height step", () => {
    const tri: Tri = [
      [0, 0],
      [20, 0],
      [10, 15],
    ];
    const sample = (east: number) => (east < 10 ? 0 : 8);
    const refined = refineSteepRoadTriangles([tri], sample, 1.75, 10_000, 20);
    expect(refined.length).toBeGreaterThan(1);
    for (const [a, b, c] of refined) {
      const hs = [sample(a[0], a[1]), sample(b[0], b[1]), sample(c[0], c[1])];
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(1.76);
    }
  });
});

describe("splitTriangle", () => {
  it("bisects long edges", () => {
    const tri: Tri = [
      [0, 0],
      [40, 0],
      [0, 3],
    ];
    const parts = splitTriangle(tri, 10);
    expect(parts.length).toBeGreaterThan(1);
    expect(maxTriangleEdge(parts)).toBeLessThanOrEqual(21);
  });
});
