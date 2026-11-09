import { describe, expect, it, vi } from "vitest";
import polygonClipping from "polygon-clipping";
import { computeCityBlocks } from "./cityBlocks";
import type { AreaFeat, CityModel, RoadFeat } from "../types";

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

  it("skips a bad water polygon instead of throwing during block carve-out", () => {
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
    const water: AreaFeat = {
      id: 2,
      kind: "water",
      ring: [
        [200, -180],
        [620, -194],
        [619, -180],
        [205, -178],
        [200, -180],
      ],
      holes: [],
    };
    const model: Pick<CityModel, "roads" | "areas" | "sideM"> = {
      sideM: 1350,
      roads,
      areas: [water],
    };
    let calls = 0;
    vi.spyOn(polygonClipping, "difference").mockImplementation((subject, clip) => {
      calls += 1;
      if (calls >= 5) throw new Error("Unable to complete output ring starting at [205.985, -180.7984]");
      return polygonClipping.difference(subject, clip);
    });
    const blocks = computeCityBlocks(model);
    expect(blocks.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
