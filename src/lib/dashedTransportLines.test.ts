import { describe, expect, it } from "vitest";
import { buildCityGroup } from "./buildCity";
import { clipTransportLines, strokeDashMetres } from "./dashedTransportLines";
import { readDrawingStyle } from "./drawingStyle";
import type { CityModel, RoadFeat } from "../types";

function miniModel(roads: RoadFeat[], tramLines?: CityModel["tramLines"]): CityModel {
  return {
    center: { lat: -37.81, lon: 144.96 },
    sideM: 400,
    placeLabel: "Test",
    sourceNote: "",
    buildings: [],
    roads,
    areas: [],
    trees: [],
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    tramLines,
    roadKm: 0,
    buildingCapHit: false,
  };
}

describe("dashed transport lines", () => {
  it("uses a dashed metre pattern for rail and tram strokes", () => {
    const style = readDrawingStyle();
    expect(style.rail.dash).not.toBe("none");
    expect(style.tram.dash).not.toBe("none");
    expect(strokeDashMetres(style.rail, 1000)[0]).toBeGreaterThan(0);
  });

  it("builds line segments instead of a rail surface mesh", () => {
    const model = miniModel([
      {
        id: 1,
        kind: "rail",
        grade: "arterial",
        line: [
          [-100, 0],
          [100, 0],
        ],
        width: 8,
      },
    ]);
    const group = buildCityGroup(model, {});
    expect(group.getObjectByName("Rail")).toBeUndefined();
    expect(group.getObjectByName("RailLines")).toBeDefined();
    expect(clipTransportLines(model).rails.length).toBeGreaterThan(0);
  });
});
