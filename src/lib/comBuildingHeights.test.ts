import { describe, expect, it } from "vitest";
import {
  applyComBuildingHeights,
  clipBuildingComExtrusions,
  intersectionAreaM2,
  pickComHeight,
  pickComHeightFallback20,
  tallestExtrusionHeight,
  type ComBuildingFootprint,
} from "./comBuildingHeights";
import type { BuildingFeat, Ring } from "../types";

function building(id: number, ring: BuildingFeat["ring"], height = 9): BuildingFeat {
  return { id, ring, holes: [], height, use: "unclassified", source: "none" };
}

describe("comBuildingHeights matching", () => {
  const footprint = (id: string, ring: ComBuildingFootprint["ring"], height_m: number): ComBuildingFootprint => ({
    id,
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
      "a",
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
      "b",
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

  it("clips podium and tower to two extrusion heights on one OSM footprint", () => {
    const osm = building(10, [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
      [0, 0],
    ]);
    const podium = footprint(
      "podium",
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      12,
    );
    const tower = footprint(
      "tower",
      [
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
        [10, 0],
      ],
      48,
    );
    const parts = clipBuildingComExtrusions(osm, [podium, tower]);
    expect(parts).not.toBeNull();
    const heights = (parts ?? []).map((p) => p.height).sort((a, b) => a - b);
    expect(heights).toContain(12);
    expect(heights).toContain(48);
    expect(tallestExtrusionHeight({ ...osm, extrusionParts: parts ?? undefined })).toBe(48);
  });

  it("drops intersection slivers under 2 m² or 5% of the OSM footprint", () => {
    const osm = building(11, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const thin = footprint(
      "thin",
      [
        [9.95, 0],
        [10.05, 0],
        [10.05, 10],
        [9.95, 10],
        [9.95, 0],
      ],
      99,
    );
    const bulk = footprint(
      "bulk",
      [
        [0, 0],
        [9, 0],
        [9, 10],
        [0, 10],
        [0, 0],
      ],
      20,
    );
    const parts = clipBuildingComExtrusions(osm, [thin, bulk]);
    expect(parts?.some((p) => p.height === 99)).toBe(false);
    expect(parts?.some((p) => p.height === 20)).toBe(true);
  });

  it("keeps the OSM height when no CoM footprint overlaps", () => {
    const osm = building(12, [
      [50, 50],
      [55, 50],
      [55, 55],
      [50, 55],
      [50, 50],
    ]);
    const remote = footprint(
      "far",
      [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
      ],
      40,
    );
    expect(clipBuildingComExtrusions(osm, [remote])).toBeNull();
    const applied = applyComBuildingHeights([osm], [remote]);
    expect(applied.updated).toBe(0);
    expect(applied.buildings[0]?.extrusionParts).toBeUndefined();
  });

  it("uses the 20% tallest-part fallback when clipping throws", () => {
    const osm = building(13, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const low = footprint(
      "low",
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      15,
    );
    const tall = footprint(
      "tall",
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      60,
    );
    expect(pickComHeightFallback20(osm, [low, tall])?.height_m).toBe(60);
    const tiny = footprint(
      "tiny",
      [
        [0, 0],
        [100, 0],
        [100, 0.5],
        [0, 0.5],
        [0, 0],
      ],
      80,
    );
    expect(pickComHeightFallback20(osm, [tiny])).toBeNull();
  });

  it("applies extrusion parts and counts updates", () => {
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
        "c1",
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
    expect(result.buildings[0]?.extrusionParts?.[0]?.height).toBe(18);
    expect(result.buildings[1]?.extrusionParts).toBeUndefined();
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
