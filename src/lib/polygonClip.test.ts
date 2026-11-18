import { describe, expect, it, vi } from "vitest";
import type { MultiPolygon } from "./safePolygonClip";
import * as safePolygonClip from "./safePolygonClip";
import { clipDifference, isPolygonClipTopologyError } from "./polygonClip";

describe("polygonClip", () => {
  it("detects martinez topology errors", () => {
    expect(
      isPolygonClipTopologyError(
        "Unable to complete output ring starting at [205.985, -180.7984]. Last matching segment found ends at [619.4484835296299, -194.4047084346072].",
      ),
    ).toBe(true);
  });

  it("returns empty when safe clip cannot difference operands", () => {
    const subject: MultiPolygon = [
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    ];
    const clip: MultiPolygon = [
      [
        [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
          [2, 2],
        ],
      ],
    ];
    vi.spyOn(safePolygonClip, "clipDifference").mockReturnValue([]);
    expect(clipDifference(subject, clip)).toEqual([]);
    vi.restoreAllMocks();
  });
});