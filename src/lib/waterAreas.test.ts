import { describe, expect, it } from "vitest";
import { isOpenWaterArea, OPEN_WATER_TAG_FIXTURES } from "./waterAreas";

describe("open water OSM tag filter", () => {
  it("includes lakes, reservoirs, and riverbank areas", () => {
    for (const tags of OPEN_WATER_TAG_FIXTURES.included) {
      expect(isOpenWaterArea(tags), JSON.stringify(tags)).toBe(true);
    }
  });

  it("excludes wetlands, park ponds, pools, zoo exhibits, and intermittent water", () => {
    for (const tags of OPEN_WATER_TAG_FIXTURES.excluded) {
      expect(isOpenWaterArea(tags), JSON.stringify(tags)).toBe(false);
    }
  });

  it("does not treat any water=* value as open water", () => {
    expect(isOpenWaterArea({ water: "pond" })).toBe(false);
    expect(isOpenWaterArea({ natural: "water", water: "river" })).toBe(true);
  });

  it("drops tiny unnamed natural=water patches and named paddling pools", () => {
    expect(isOpenWaterArea({ natural: "water" }, 1200)).toBe(false);
    expect(isOpenWaterArea({ natural: "water", name: "Tam-Boore" }, 1200)).toBe(true);
    expect(isOpenWaterArea({ natural: "water", name: "Crocodile Paddling Pool" }, 800)).toBe(false);
  });
});
