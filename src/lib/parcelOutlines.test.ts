import { describe, expect, it } from "vitest";
import { buildParcelOutlineIndex, clipSegmentToSquare, searchParcelOutlines } from "./parcelOutlines";

describe("parcelOutlines", () => {
  it("clips segments to the cut square", () => {
    expect(clipSegmentToSquare([-20, 0], [20, 0], 10)).toEqual([[-10, 0], [10, 0]]);
    expect(clipSegmentToSquare([20, 20], [30, 30], 10)).toBeNull();
    expect(clipSegmentToSquare([1, 1], [2, 2], 10)).toEqual([[1, 1], [2, 2]]);
  });

  it("rbush search returns parcels intersecting bounds", () => {
    const index = buildParcelOutlineIndex([
      { id: "a", ring: [[144.96, -37.8], [144.961, -37.8], [144.961, -37.801], [144.96, -37.8]] },
      { id: "b", ring: [[145.5, -37.0], [145.51, -37.0], [145.51, -37.01], [145.5, -37.0]] },
    ]);
    const hits = searchParcelOutlines(index, { west: 144.95, south: -37.81, east: 144.97, north: -37.79 });
    expect(hits.map((p) => p.id)).toEqual(["a"]);
  });
});
