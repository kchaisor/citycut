import { describe, expect, it, vi } from "vitest";
import { maxConsecutiveJump, sanitizeRoadFeatures, splitPolylineAtJumps } from "./roadLineValidation";
import type { RoadFeat } from "../types";

describe("roadLineValidation", () => {
  it("splits at a long jump and drops parts that still exceed the limit", () => {
    const road: RoadFeat = {
      id: 1,
      line: [
        [0, 0],
        [10, 0],
        [500, 0],
        [510, 0],
      ],
      width: 6,
      kind: "road",
    };
    const parts = splitPolylineAtJumps(road.line, 50);
    expect(parts).toHaveLength(2);
    const log = vi.fn();
    const { roads, dropped } = sanitizeRoadFeatures([road], 50, log);
    expect(roads.length).toBeGreaterThan(0);
    expect(roads.every((r) => maxConsecutiveJump(r.line) <= 50)).toBe(true);
    expect(dropped).toBe(0);
  });

  it("drops a single segment whose only edge is a chord", () => {
    const road: RoadFeat = {
      id: 2,
      line: [
        [0, 0],
        [400, 400],
      ],
      width: 3,
      kind: "road",
      grade: "path",
    };
    const log = vi.fn();
    const { roads, dropped } = sanitizeRoadFeatures([road], 50, log);
    expect(roads).toHaveLength(0);
    expect(dropped).toBe(1);
    expect(log).toHaveBeenCalled();
  });
});
