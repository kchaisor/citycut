import { describe, expect, it } from "vitest";
import type { RoadFeat } from "../types";
import { hashRoadFeatures } from "./geometryHash";

describe("geometryHash", () => {
  it("hashRoadFeatures includes road kind and grade", () => {
    const line = [
      [0, 0],
      [10, 0],
    ] as RoadFeat["line"];
    const arterial: RoadFeat = { id: 1, line, width: 8, kind: "road", grade: "arterial" };
    const rail: RoadFeat = { id: 1, line, width: 8, kind: "rail", grade: "arterial" };
    expect(hashRoadFeatures([rail])).not.toBe(hashRoadFeatures([arterial]));
  });
});
