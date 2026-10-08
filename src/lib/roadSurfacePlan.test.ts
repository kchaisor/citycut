import { describe, expect, it } from "vitest";
import type { MultiPolygon } from "polygon-clipping";
import { signedArea } from "./geo";
import { splitGreenForRoadLayer } from "./roadSurfacePlan";
import type { Pt } from "../types";

function rect(w: number, h: number, cx = 0, cy = 0): MultiPolygon {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const ring: MultiPolygon[0][0] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  return [[ring]];
}

describe("splitGreenForRoadLayer", () => {
  it("keeps full park green below and only puts road intersection in greenOnRoad", () => {
    const outer: Pt[] = [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
      [-50, -50],
    ];
    const green: Pt[][][] = [[outer]];
    const road = rect(20, 80, 0, 0);
    const { green: below, greenOnRoad } = splitGreenForRoadLayer(green, road);
    expect(below).toHaveLength(1);
    expect(Math.abs(signedArea(below[0]![0]!))).toBeCloseTo(100 * 100, 0);
    expect(greenOnRoad.length).toBe(1);
    expect(Math.abs(signedArea(greenOnRoad[0]![0]!))).toBeCloseTo(20 * 80, 0);
  });
});
