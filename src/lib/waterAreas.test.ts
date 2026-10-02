import { describe, expect, it } from "vitest";
import {
  isOpenWaterArea,
  isRiverWaterArea,
  MIN_WATER_AREA_M2,
  OPEN_WATER_TAG_FIXTURES,
} from "./waterAreas";

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

  it("applies the minimum water area unless the feature is a river", () => {
    const pond = { natural: "water", water: "pond" };
    expect(MIN_WATER_AREA_M2).toBe(500);
    expect(isOpenWaterArea(pond, 499)).toBe(false);
    expect(isOpenWaterArea(pond, 501)).toBe(true);
    expect(isRiverWaterArea({ waterway: "riverbank" })).toBe(true);
    expect(isOpenWaterArea({ waterway: "riverbank" }, 12)).toBe(true);
    expect(isOpenWaterArea({ natural: "water", water: "river" }, 40)).toBe(true);
  });
});
