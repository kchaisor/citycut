import { describe, expect, it } from "vitest";
import {
  BRIDGE_DECK_CLEARANCE_M,
  closestParameter,
  deckHeightAt,
  mergeAdjacentDeckRoads,
} from "./roadDrape";
import type { RoadFeat } from "../types";

describe("deckHeightAt", () => {
  const line: [number, number][] = [
    [0, 0],
    [100, 0],
  ];
  const sample = (east: number) => (east < 50 ? 2 : 8);

  it("meets the abutment ground at each end on the centreline", () => {
    expect(deckHeightAt(line, sample, 0, 0)).toBeCloseTo(2, 5);
    expect(deckHeightAt(line, sample, 100, 0)).toBeCloseTo(8, 5);
  });

  it("is a linear ramp plus clearance at mid-span", () => {
    const mid = deckHeightAt(line, sample, 50, 0);
    expect(mid).toBeCloseTo(5 + BRIDGE_DECK_CLEARANCE_M, 5);
  });

  it("blends to local terrain at abutments off the centreline", () => {
    const sloped = (_east: number, north: number) => 10 + north * 0.5;
    expect(deckHeightAt(line, sloped, 0, 6)).toBeCloseTo(sloped(0, 6), 5);
    expect(deckHeightAt(line, sloped, 100, -4)).toBeCloseTo(sloped(100, -4), 5);
  });

  it("does not sit below local ground within the end taper", () => {
    const sloped = (_east: number, north: number) => 10 + north * 0.5;
    const nearStart = deckHeightAt(line, sloped, 4, 5);
    expect(nearStart).toBeGreaterThanOrEqual(sloped(4, 5) - 1e-4);
  });

  it("finds the closest parameter along the centreline", () => {
    expect(closestParameter(line, [25, 4])).toBeCloseTo(0.25, 5);
  });
});

describe("mergeAdjacentDeckRoads", () => {
  it("chains deck spans that meet at an abutment", () => {
    const roads: RoadFeat[] = [
      { id: 1, line: [[0, 0], [50, 0]], width: 10, kind: "road", grade: "arterial", deck: true },
      { id: 2, line: [[50, 0], [100, 0]], width: 10, kind: "road", grade: "arterial", deck: true },
    ];
    const merged = mergeAdjacentDeckRoads(roads);
    expect(merged).toHaveLength(1);
    expect(merged[0].line[0]).toEqual([0, 0]);
    expect(merged[0].line[merged[0].line.length - 1]).toEqual([100, 0]);
  });
});
