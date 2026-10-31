import { describe, expect, it } from "vitest";
import type { BuildingUse, CityModel, Pt } from "../types";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";

const origin = { lon: 144.9631, lat: -37.8136 };

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

function layerTreeFixture(): CityModel {
  const buildingUses: BuildingUse[] = [
    "residential",
    "commercial",
    "civic",
    "recreation",
    "unclassified",
    "outbuilding",
    "retail",
  ];
  const apiRowIds = [30, 5, 12, 7, 1, 22, 3];
  return {
    placeLabel: "Layer order",
    center: origin,
    sideM: 220,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: buildingUses.map((use, index) => ({
      id: apiRowIds[index]!,
      ring: square([index * 24, 0], 18),
      holes: [],
      height: 10 + index,
      use,
      source: "none",
    })),
    roads: [{ id: 99, line: [[-90, 12], [90, 12]], width: 6, kind: "road" }],
    areas: [
      { id: 100, ring: square([-50, -45], 28), holes: [], kind: "green" },
      { id: 101, ring: square([35, 35], 22), holes: [], kind: "water" },
    ],
    trees: [
      {
        id: 0,
        at: [40, -30],
        height_m: 11,
        crown_diameter_m: 7,
        trunk_diameter_m: 0.35,
        sizeSource: "osm",
      },
    ],
    roadKm: 0.18,
    buildingCapHit: false,
    sourceNote: "test",
  };
}

function docLayerFullPaths(doc: { layers: () => { count: number; get: (i: number) => { fullPath: string } } }): string[] {
  const paths: string[] = [];
  for (let i = 0; i < doc.layers().count; i++) paths.push(doc.layers().get(i).fullPath);
  return paths;
}

const MAIN_RHINO_LAYER_TREE = [
  "Ground",
  "Green",
  "Water",
  "Roads",
  "Buildings",
  "Buildings::Residential",
  "Buildings::Commercial",
  "Buildings::Civic",
  "Buildings::Recreation",
  "Buildings::Unclassified",
  "Buildings::Outbuilding",
  "Buildings::Retail",
  "Trees",
  "FigureGround",
] as const;

describe("Rhino layer tree", () => {
  it("matches main layer order including Buildings sub-layers", async () => {
    const bytes = await cityModelTo3dm(layerTreeFixture());
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      expect(docLayerFullPaths(doc)).toEqual([...MAIN_RHINO_LAYER_TREE]);
    } finally {
      doc.destroy();
    }
  });
});
