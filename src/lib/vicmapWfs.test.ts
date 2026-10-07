import { describe, expect, it } from "vitest";
import { geometryIntersectsBounds } from "./vicmapWfs";

describe("geometryIntersectsBounds", () => {
  const richmond = { west: 144.987, south: -37.836, east: 145.005, north: -37.818 };

  it("keeps Yarra watercourse geometry inside the crop", () => {
    const geometry = {
      type: "LineString",
      coordinates: [
        [145.004235, -37.831296],
        [145.004151, -37.831372],
      ],
    };
    expect(geometryIntersectsBounds(geometry, richmond)).toBe(true);
  });

  it("drops Vicmap water polygons returned outside the WFS bbox", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [145.423452, -37.658121],
          [145.423472, -37.658118],
          [145.42389, -37.658028],
          [145.423452, -37.658121],
        ],
      ],
    };
    expect(geometryIntersectsBounds(geometry, richmond)).toBe(false);
  });
});
