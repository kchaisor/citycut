import { describe, expect, it } from "vitest";
import { signedArea } from "./geo";
import { centerlinePartsOutsideWater, waterFallbackFromCenterlines } from "./waterRibbonFallback";
import type { AreaFeat, Ring } from "../types";

function riverPolygon(): AreaFeat {
  const ring: Ring = [
    [-20, -5],
    [20, -5],
    [20, 5],
    [-20, 5],
    [-20, -5],
  ];
  return { id: 1, kind: "water", ring, holes: [] };
}

describe("waterRibbonFallback", () => {
  it("adds no extra water when the centreline lies inside an existing river polygon", () => {
    expect(centerlinePartsOutsideWater([[-15, 0], [15, 0]], [riverPolygon()])).toEqual([]);
    const polygon = riverPolygon();
    const centerlines = [
      {
        id: "y1",
        line: [
          [-15, 0],
          [15, 0],
        ] as import("../types").Pt[],
        props: { class: "river" },
      },
    ];
    const fallback = waterFallbackFromCenterlines(centerlines, [polygon]);
    expect(fallback).toHaveLength(0);
  });

  it("still produces a narrow ribbon for an uncovered centreline stretch", () => {
    const centerlines = [
      {
        id: "y2",
        line: [
          [0, 50],
          [0, 80],
        ] as import("../types").Pt[],
        props: { class: "river" },
      },
    ];
    const fallback = waterFallbackFromCenterlines(centerlines, []);
    expect(fallback.length).toBeGreaterThan(0);
    const area = Math.abs(signedArea(fallback[0]!.ring));
    expect(area).toBeGreaterThan(10);
    expect(area).toBeLessThan(400);
  });
});
