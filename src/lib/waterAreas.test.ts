import { describe, expect, it } from "vitest";
import { isOpenWaterArea, OPEN_WATER_TAG_FIXTURES } from "./waterAreas";

describe("open water OSM tag filter", () => {
  it("includes lakes, ponds, reservoirs, and riverbank areas", () => {
    for (const tags of OPEN_WATER_TAG_FIXTURES.included) {
      expect(isOpenWaterArea(tags), JSON.stringify(tags)).toBe(true);
    }
  });

  it("excludes wetlands, drains, fountains, pools, zoo exhibits, and intermittent water", () => {
    for (const tags of OPEN_WATER_TAG_FIXTURES.excluded) {
      expect(isOpenWaterArea(tags), JSON.stringify(tags)).toBe(false);
    }
  });

  it("keeps real ponds and does not use area or name heuristics", () => {
    expect(isOpenWaterArea({ natural: "water", water: "pond" })).toBe(true);
    expect(isOpenWaterArea({ natural: "water", name: "Crocodile Paddling Pool" })).toBe(true);
    expect(isOpenWaterArea({ natural: "water" })).toBe(true);
  });
});
