import { describe, expect, it } from "vitest";
import { buildCityGroup, disposeObject } from "./buildCity";
import { addBuildingEdges } from "./buildingEdges";
import {
  countSolidBuildingEdgesHidden,
  setSolidBuildingEdgesVisible,
} from "./buildingSelectionSolidEdges";

const model = {
  placeLabel: "Test",
  center: { lat: -37.81, lon: 145.1 },
  sideM: 400,
  roadKm: 0,
  buildingCapHit: false,
  buildings: [
    {
      id: 1,
      ring: [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
        [0, 0],
      ] as [number, number][],
      holes: [],
      height: 10,
      use: "residential" as const,
      source: "osm_tag" as const,
    },
    {
      id: 2,
      ring: [
        [40, 0],
        [70, 0],
        [70, 30],
        [40, 30],
        [40, 0],
      ] as [number, number][],
      holes: [],
      height: 12,
      use: "commercial" as const,
      source: "osm_tag" as const,
    },
  ],
  roads: [],
  areas: [],
  trees: [],
  layers: { buildings: true, roads: true, waterGreen: true, trees: false },
  sourceNote: "test",
};

describe("buildingSelectionSolidEdges", () => {
  it("hides solid edge lines only for selected building ids and restores on cleanup", () => {
    const city = buildCityGroup(model, { uniformBuildings: true });
    addBuildingEdges(city);
    const restore = setSolidBuildingEdgesVisible(city, [2], false);
    expect(countSolidBuildingEdgesHidden(city, [2])).toBeGreaterThan(0);
    expect(countSolidBuildingEdgesHidden(city, [1])).toBe(0);
    restore();
    expect(countSolidBuildingEdgesHidden(city, [2])).toBe(0);
    disposeObject(city);
  });
});
