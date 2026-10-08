import { describe, expect, it } from "vitest";
import type { MultiPolygon, Pair } from "polygon-clipping";
import { signedArea } from "./geo";
import { offsetCloseMultiPolygon, offsetMultiPolygon } from "./polygonOffset";

function rect(w: number, h: number, ccw = true): MultiPolygon {
  const pts: Pair[] = ccw
    ? [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
        [0, 0],
      ]
    : [
        [0, 0],
        [0, h],
        [w, h],
        [w, 0],
        [0, 0],
      ];
  return [[pts]];
}

function multiArea(multi: MultiPolygon): number {
  let area = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (!outer) continue;
    area += Math.abs(signedArea(outer.slice(0, -1)));
    for (const hole of polygon.slice(1)) area -= Math.abs(signedArea(hole.slice(0, -1)));
  }
  return area;
}

describe("polygonOffset", () => {
  it("expands a 10 x 1.2 m rectangle by +2 m", () => {
    const base = rect(10, 1.2);
    expect(multiArea(base)).toBeCloseTo(12, 2);
    const expanded = offsetMultiPolygon(base, 2);
    expect(multiArea(expanded)).toBeGreaterThan(67);
    expect(multiArea(expanded)).toBeLessThan(74);
  });

  it("shrinks a 10 x 1.2 m rectangle by -0.5 m", () => {
    const base = rect(10, 1.2);
    const shrunk = offsetMultiPolygon(base, -0.5);
    expect(multiArea(shrunk)).toBeGreaterThan(1.7);
    expect(multiArea(shrunk)).toBeLessThan(1.85);
  });

  it("offsets CW and CCW rectangles the same way", () => {
    const ccw = offsetMultiPolygon(rect(10, 1.2, true), 2);
    const cw = offsetMultiPolygon(rect(10, 1.2, false), 2);
    expect(multiArea(ccw)).toBeCloseTo(multiArea(cw), 1);
  });

  it("closes a concave corner without growing a square footprint", () => {
    const lShape: MultiPolygon = [
      [
        [
          [0, 0],
          [10, 0],
          [10, 2],
          [2, 2],
          [2, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    ];
    const closed = offsetCloseMultiPolygon(lShape, 1);
    expect(closed.length).toBeGreaterThan(0);
    const expanded = offsetMultiPolygon(lShape, 2);
    const shrunk = offsetMultiPolygon(expanded, -2);
    expect(shrunk.length).toBeGreaterThan(0);
    expect(multiArea(closed)).toBeGreaterThanOrEqual(multiArea(lShape) * 0.98);
  });
});

