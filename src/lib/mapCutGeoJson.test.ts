import { describe, expect, it } from "vitest";
import { cutColourMaskGeoJson, cutFrameGeoJson } from "./mapCutGeoJson";

describe("cutColourMaskGeoJson", () => {
  const center = { lon: 144.96, lat: -37.81 };

  it("carves a square frame hole in the outer sheet", () => {
    const mask = cutColourMaskGeoJson(center, 500, "square");
    expect(mask.geometry.type).toBe("Polygon");
    const coords = (mask.geometry as GeoJSON.Polygon).coordinates;
    expect(coords).toHaveLength(2);
    expect(coords[1]).toEqual((cutFrameGeoJson(center, 500, "square").geometry as GeoJSON.Polygon).coordinates[0]);
  });

  it("carves a circle frame hole when the frame is a circle", () => {
    const mask = cutColourMaskGeoJson(center, 500, "circle");
    const coords = (mask.geometry as GeoJSON.Polygon).coordinates;
    expect(coords[1]!.length).toBeGreaterThan(32);
  });
});
