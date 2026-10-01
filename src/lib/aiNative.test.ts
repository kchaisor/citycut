import { describe, expect, it } from "vitest";
import {
  aiLayerLabel,
  buildLayeredNativeAi,
  nativeAiBodyUsesPdfOperators,
  nativeAiLooksLikeEps,
  parseNativeAiLayers,
} from "./aiNative";
import { SITE_LAYER_ORDER, sitePlanAi, sitePlanAi8 } from "./aiPlan";
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
  it("keeps the PDF writer as the default site-plan export", async () => {
    const bytes = await sitePlanAi(model(), 1000);
    expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
    expect(nativeAiLooksLikeEps(bytes)).toBe(false);
  });

  it("writes AI8 EPS with %AI5_BeginLayer blocks in site-plan order", () => {
    const bytes = sitePlanAi8(model(), 1000);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(nativeAiLooksLikeEps(bytes)).toBe(true);
    expect(text).toContain("%%Creator: Adobe Illustrator(R) 8.0");
    expect(text).toContain("%%AI8_CreatorVersion");
    expect(text).toContain("%AI5_FileFormat");
    expect(text).toContain("%%DocumentProcSets");
    expect(text).toContain("%%BeginProlog");
    expect(nativeAiBodyUsesPdfOperators(bytes)).toBe(false);
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

  it("uses Illustrator paint operators in the body", () => {
    const bytes = buildLayeredNativeAi(
      100,
      80,
      [
        {
          name: "Ink",
          paths: [
            {
              rings: [
                [
                  [10, 10],
                  [40, 10],
                  [40, 30],
                  [10, 30],
                ],
              ],
              fill: [0.2, 0.4, 0.6],
              close: true,
            },
          ],
        },
      ],
      ["Ink"],
    );
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toMatch(/[\d.]+ [\d.]+ [\d.]+ Xa/);
    expect(text).toContain("*u");
    expect(text).toContain("*U");
    expect(nativeAiBodyUsesPdfOperators(bytes)).toBe(false);
  });
});
