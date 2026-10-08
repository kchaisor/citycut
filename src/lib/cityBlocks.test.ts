import { describe, expect, it } from "vitest";
import { computeCityBlocks } from "./cityBlocks";
import type { CityModel, RoadFeat } from "../types";

describe("computeCityBlocks", () => {
  it("returns block polygons inside the frame when roads enclose space", () => {
    const roads: RoadFeat[] = [
      {
        id: 1,
        kind: "road",
        grade: "local",
        width: 10,
        line: [
          [-400, -400],
          [400, -400],
          [400, 400],
          [-400, 400],
          [-400, -400],
        ],
      },
    ];
    const model: Pick<CityModel, "roads" | "areas" | "sideM"> = {
      sideM: 1000,
      roads,
      areas: [],
    };
    const blocks = computeCityBlocks(model);
    expect(blocks.length).toBeGreaterThan(0);
  });
});
