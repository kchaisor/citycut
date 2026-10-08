import { describe, expect, it } from "vitest";
import { findDuplicateBuildingPairs } from "./layerDuplicateAudit";
import type { BuildingFeat } from "../types";

function sq(id: number, x: number, y: number, size: number): BuildingFeat {
  const h = size / 2;
  return {
    id,
    ring: [
      [x - h, y - h],
      [x + h, y - h],
      [x + h, y + h],
      [x - h, y + h],
      [x - h, y - h],
    ],
    holes: [],
    height: 9,
    use: "residential",
    source: "none",
  };
}

describe("layerDuplicateAudit", () => {
  it("flags overlapping building footprints above IoU threshold", () => {
    const pairs = findDuplicateBuildingPairs([sq(1, 0, 0, 20), sq(2, 1, 1, 20)], 0.5);
    expect(pairs.length).toBeGreaterThan(0);
  });
});
