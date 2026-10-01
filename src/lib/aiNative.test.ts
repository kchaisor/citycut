import { describe, expect, it } from "vitest";
import { aiLayerLabel, buildLayeredNativeAi, nativeAiLooksLikeEps, parseNativeAiLayers } from "./aiNative";
import { SITE_LAYER_ORDER, sitePlanAi } from "./aiPlan";
import type { CityModel } from "../types";

function model(): CityModel {
  return {
    placeLabel: "Test Block",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      {
        id: 1,
        ring: [
          [-20, -20],
          [20, -20],
          [20, 20],
          [-20, 20],
          [-20, -20],
        ],
        holes: [],
        height: 12,
        use: "residential",
        source: "osm_tag",
      },
    ],
    roads: [
      { id: 2, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" },
      { id: 6, line: [[-30, -20], [30, -20]], width: 2, kind: "road", grade: "path" },
    ],
    areas: [{ id: 3, ring: [[-45, -45], [-30, -30], [-30, -45], [-45, -45]], holes: [], kind: "green" }],
    trees: [],
    roadKm: 0.16,
    buildingCapHit: false,
    sourceNote: "OpenStreetMap via Overpass.",
    contours: false,
  };
}

describe("native Illustrator layers", () => {
  it("writes EPS with %AI5_BeginLayer blocks in site-plan order", async () => {
    const bytes = await sitePlanAi(model(), 1000);
    expect(nativeAiLooksLikeEps(bytes)).toBe(true);
    const layers = parseNativeAiLayers(bytes);
    expect(layers[0]).toBe(aiLayerLabel("Frame"));
    expect(layers).toContain(aiLayerLabel("Green"));
    expect(layers).toContain(aiLayerLabel("Footpaths"));
    const order = SITE_LAYER_ORDER.map((name) => aiLayerLabel(name)).filter((name) => layers.includes(name));
    expect(layers.filter((name) => order.includes(name))).toEqual(order);
  });

  it("keeps empty layers out of the file", () => {
    const bytes = buildLayeredNativeAi(100, 80, [{ name: "Only", paths: [] }], ["Only"]);
    expect(parseNativeAiLayers(bytes)).toEqual([]);
  });
});
