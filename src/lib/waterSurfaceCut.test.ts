import { describe, expect, it } from "vitest";
import type { Pt } from "../types";
import { pointInWaterAreas } from "./waterSurfaceCut";

describe("waterSurfaceCut", () => {
  it("detects points inside harbour rings", () => {
    const ring: Pt[] = [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
      [-50, -50],
    ];
    const areas = [{ ring, holes: [] as Pt[][] }];
    expect(pointInWaterAreas(0, 0, areas)).toBe(true);
    expect(pointInWaterAreas(80, 80, areas)).toBe(false);
  });
});