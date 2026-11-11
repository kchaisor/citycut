import { describe, expect, it } from "vitest";
import { drawingMassingCount, massingDrawingBuildings } from "./massingFootprint";
import { importMassingFixture } from "./massingFixture3dm";
import { mgaCrs } from "./crsZone";

const origin = { lon: 151.21512, lat: -33.8572 };
const zone = mgaCrs(origin.lon).zone;

describe("drawingMassingCount", () => {
  it("counts visible footprints and excludes per-roof shadow casters", async () => {
    const item = await importMassingFixture("setback", origin, zone);
    const buildings = massingDrawingBuildings([item], origin, zone);
    const casters = buildings.filter((b) => b.importedMassingShadowCaster);
    expect(casters.length).toBeGreaterThanOrEqual(2);
    expect(drawingMassingCount(buildings)).toBe(buildings.length - casters.length);
    expect(drawingMassingCount(buildings)).toBeGreaterThanOrEqual(1);
  });
});
