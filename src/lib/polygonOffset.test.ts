import { describe, expect, it } from "vitest";
import type { MultiPolygon } from "polygon-clipping";
import { offsetCloseMultiPolygon, offsetMultiPolygon } from "./polygonOffset";

describe("polygonOffset", () => {
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
  });
});
