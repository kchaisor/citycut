import { describe, expect, it } from "vitest";
import { isOvertureWaterPolygon, waterLineHalfWidthM, waterTagsFromOverture } from "./overtureBaseMapping";
import { UNTAGGED_WATER_MIN_AREA_M2 } from "./waterAreas";

describe("overtureBaseMapping water", () => {
  it("maps river subtype to PR #35 river tags", () => {
    const tags = waterTagsFromOverture({ class: "river", subtype: "river" });
    expect(tags.waterway).toBe("river");
    expect(isOvertureWaterPolygon({ class: "river" }, square(200))).toBe(true);
  });

  it("uses narrow fallback half-widths for river centreline ribbons", () => {
    expect(waterLineHalfWidthM({ class: "river" })).toBe(6);
    expect(waterLineHalfWidthM({ class: "canal" })).toBe(4);
    expect(waterLineHalfWidthM({ class: "stream" })).toBe(4);
    expect(waterLineHalfWidthM({ class: "dock" })).toBe(3);
  });

  it("hides ponds and small untagged water", () => {
    const pond = waterTagsFromOverture({ class: "pond", source_tags: '{"natural":"water","water":"pond"}' });
    expect(isOvertureWaterPolygon({ class: "pond", source_tags: JSON.stringify(pond) }, square(5000))).toBe(
      false,
    );
    const generic = waterTagsFromOverture({ class: "physical", source_tags: '{"natural":"water"}' });
    expect(
      isOvertureWaterPolygon(
        { source_tags: JSON.stringify(generic) },
        square(Math.sqrt(UNTAGGED_WATER_MIN_AREA_M2) - 1),
      ),
    ).toBe(false);
  });
});

function square(side: number): import("../types").Ring {
  const h = side / 2;
  return [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
    [-h, -h],
  ];
}
