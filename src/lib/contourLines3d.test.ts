import { describe, expect, it } from "vitest";
import { drapeContourSegments } from "./contourLines3d";

describe("contour drape", () => {
  it("splits long segments so every piece sits on the sampled terrain", () => {
    const bump = (east: number) => 10 - Math.abs(east) / 10; // ridge at east = 0
    const positions = drapeContourSegments([[[-50, 0], [50, 0]]], (east) => bump(east), 25, 0.5);
    // 100 m at a 25 m step: 4 pieces, 6 numbers each.
    expect(positions.length).toBe(4 * 6);
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i + 1]).toBeCloseTo(bump(positions[i]!) + 0.5, 6);
    }
    // The ridge top is a vertex, so the line does not cut under it.
    expect(positions.some((value, i) => i % 3 === 0 && Math.abs(value) < 1e-9)).toBe(true);
  });

  it("keeps a short segment whole and maps north to -Z", () => {
    const positions = drapeContourSegments([[[0, 0], [3, 4]]], () => 2, 25, 0);
    expect(positions).toEqual([0, 2, -0, 3, 2, -4]);
  });
});
