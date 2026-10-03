import { describe, expect, it } from "vitest";
import {
  applyComBuildingHeights,
  intersectionAreaM2,
  pickComHeight,
  type ComBuildingFootprint,
} from "./comBuildingHeights";
import type { BuildingFeat, Ring } from "../types";

function building(id: number, ring: BuildingFeat["ring"], height = 9): BuildingFeat {
  return { id, ring, holes: [], height, use: "unclassified", source: "none" };
}

describe("comBuildingHeights matching", () => {
  const footprint = (ring: ComBuildingFootprint["ring"], height_m: number): ComBuildingFootprint => ({
    id: "com-1",
    ring,
    holes: [],
    height_m,
  });

  it("chooses the CoM footprint with the largest overlap", () => {
    const osm = building(1, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const small = footprint(
      [
        [1, 1],
        [4, 1],
        [4, 4],
        [1, 4],
        [1, 1],
      ],
      12,
    );
    const large = footprint(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      24,
    );
    expect(pickComHeight(osm, [small, large])?.height_m).toBe(24);
  });

  it("falls back to centroid containment when overlap area is zero", () => {
    const osm = building(2, [
      [20, 20],
      [22, 20],
      [22, 22],
      [20, 22],
      [20, 20],
    ]);
    const host = footprint(
      [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
        [0, 0],
      ],
      15,
    );
    expect(pickComHeight(osm, [host])?.height_m).toBe(15);
  });

  it("applies heights and counts updates", () => {
    const buildings = [
      building(3, [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
      ]),
      building(4, [
        [50, 50],
        [55, 50],
        [55, 55],
        [50, 55],
        [50, 50],
      ]),
    ];
    const footprints = [
      footprint(
        [
          [0, 0],
          [5, 0],
          [5, 5],
          [0, 5],
          [0, 0],
        ],
        18,
      ),
    ];
    const result = applyComBuildingHeights(buildings, footprints);
    expect(result.updated).toBe(1);
    expect(result.buildings[0]?.height).toBe(18);
    expect(result.buildings[1]?.height).toBe(9);
  });

  it("measures intersection area for overlapping squares", () => {
    const a = {
      ring: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ] as Ring,
      holes: [] as Ring[],
    };
    const b = {
      ring: [
        [5, 5],
        [15, 5],
        [15, 15],
        [5, 15],
        [5, 5],
      ] as Ring,
      holes: [] as Ring[],
    };
    expect(intersectionAreaM2(a, b)).toBeCloseTo(25, 1);
  });
});
