import { describe, expect, it } from "vitest";
import {
  isOpenWaterArea,
  isRiverWaterArea,
  OPEN_WATER_TAG_FIXTURES,
  UNTAGGED_WATER_MIN_AREA_M2,
} from "./waterAreas";

describe("open water OSM tag filter", () => {
  it("includes lakes, reservoirs, and river areas from fixtures", () => {
    for (const tags of OPEN_WATER_TAG_FIXTURES.included) {
      expect(isOpenWaterArea(tags), JSON.stringify(tags)).toBe(true);
    }
  });

  it("excludes ponds, wetlands, drains, fountains, pools, and covered reservoirs", () => {
    for (const tags of OPEN_WATER_TAG_FIXTURES.excluded) {
      expect(isOpenWaterArea(tags), JSON.stringify(tags)).toBe(false);
    }
  });

  it("applies Kelvin size and tag rules", () => {
    expect(UNTAGGED_WATER_MIN_AREA_M2).toBe(10_000);
    expect(isOpenWaterArea({ natural: "water", water: "pond" }, 50_000)).toBe(false);
    expect(isOpenWaterArea({ natural: "water", water: "lake" }, 200)).toBe(true);
    expect(isOpenWaterArea({ landuse: "reservoir" }, 100)).toBe(true);
    expect(isOpenWaterArea({ natural: "water", water: "reservoir" }, 50)).toBe(true);
    expect(isOpenWaterArea({ landuse: "reservoir", man_made: "reservoir_covered" }, 50_000)).toBe(
      false,
    );
    expect(isOpenWaterArea({ natural: "water" }, 9_999)).toBe(false);
    expect(isOpenWaterArea({ natural: "water" }, 10_001)).toBe(true);
    expect(isRiverWaterArea({ waterway: "riverbank" })).toBe(true);
    expect(isOpenWaterArea({ waterway: "riverbank" }, 5)).toBe(true);
    expect(isOpenWaterArea({ natural: "water", water: "river" }, 1)).toBe(true);
    expect(isOpenWaterArea({ natural: "water", water: "harbour" }, 50)).toBe(true);
  });
});
