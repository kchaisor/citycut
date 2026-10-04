import { describe, expect, it } from "vitest";
import { reassembleBuildingFragments } from "./overtureBuildings";

describe("reassembleBuildingFragments", () => {
  it("unions fragments with the same Overture id", () => {
    const merged = reassembleBuildingFragments([
      {
        id: "abc",
        ring: [
          [0, 0],
          [10, 0],
          [10, 5],
          [0, 5],
          [0, 0],
        ],
        holes: [],
        props: { height: 12 },
        microsoft: false,
        osmWayIds: [],
      },
      {
        id: "abc",
        ring: [
          [10, 0],
          [20, 0],
          [20, 5],
          [10, 5],
          [10, 0],
        ],
        holes: [],
        props: { height: 12 },
        microsoft: false,
        osmWayIds: [],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.ring.length).toBeGreaterThan(4);
  });

  it("drops tile-buffer slivers under 2 m²", () => {
    const merged = reassembleBuildingFragments([
      {
        id: "tiny",
        ring: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
        holes: [],
        props: {},
        microsoft: false,
        osmWayIds: [],
      },
    ]);
    expect(merged).toHaveLength(0);
  });

  it("keeps the tallest fragment height after union", () => {
    const merged = reassembleBuildingFragments([
      {
        id: "tower",
        ring: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        holes: [],
        props: { height: 9 },
        microsoft: false,
        osmWayIds: [1],
      },
      {
        id: "tower",
        ring: [
          [10, 0],
          [20, 0],
          [20, 10],
          [10, 10],
          [10, 0],
        ],
        holes: [],
        props: { height: 280 },
        microsoft: false,
        osmWayIds: [1],
      },
    ]);
    expect(merged[0]?.props.height).toBe(280);
  });
});
