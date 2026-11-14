import { describe, expect, it } from "vitest";
import type { Pt } from "../types";
import {
  contour3dSegmentCount,
  filterContourPolylinesFor3d,
  CONTOUR_3D_MIN_LENGTH_M,
} from "./contourLines3d";

describe("3D contour filtering", () => {
  it("drops contour polylines shorter than the minimum length", () => {
    const lines: Pt[][] = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [10, 0],
      ],
    ];
    const filtered = filterContourPolylinesFor3d(lines, CONTOUR_3D_MIN_LENGTH_M);
    expect(filtered.length).toBe(1);
    expect(filtered[0]![1]![0]).toBe(10);
  });

  it("reports segment count for density checks", () => {
    const sparse: Pt[][] = [
      [
        [0, 0],
        [50, 0],
        [100, 0],
      ],
    ];
    expect(contour3dSegmentCount(sparse)).toBe(2);
    const dense: Pt[][] = Array.from({ length: 30 }, (_, i) => [
      [i * 4, 0],
      [i * 4 + 20, 0],
    ] as Pt[]);
    expect(contour3dSegmentCount(dense)).toBeGreaterThan(contour3dSegmentCount(sparse));
  });
});