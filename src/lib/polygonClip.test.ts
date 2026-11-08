import { describe, expect, it, vi } from "vitest";
import polygonClipping from "polygon-clipping";
import { clipDifference, isPolygonClipTopologyError } from "./polygonClip";

describe("polygonClip", () => {
  it("detects martinez topology errors", () => {
    expect(
      isPolygonClipTopologyError(
        "Unable to complete output ring starting at [205.985, -180.7984]. Last matching segment found ends at [619.4484835296299, -194.4047084346072].",
      ),
    ).toBe(true);
  });

  it("returns the subject when difference throws", () => {
    const subject = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ] as const;
    const clip = [
      [
        [2, 2],
        [4, 2],
        [4, 4],
        [2, 4],
        [2, 2],
      ],
    ] as const;
    vi.spyOn(polygonClipping, "difference").mockImplementation(() => {
      throw new Error("Unable to complete output ring starting at [1, 2]");
    });
    expect(clipDifference(subject as never, clip as never)).toEqual(subject);
    vi.restoreAllMocks();
  });
});
