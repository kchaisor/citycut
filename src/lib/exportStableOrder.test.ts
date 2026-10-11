import { describe, expect, it } from "vitest";
import { stableExportModel } from "./exportStableOrder";
import type { TreeFeat } from "../types";

describe("compareTreesForExport", () => {
  it("sorts trees by position when API row ids differ", () => {
    const west: TreeFeat = {
      id: 1,
      at: [-5, 3],
      height_m: 9,
      crown_diameter_m: 6,
      trunk_diameter_m: 0.35,
      sizeSource: "com",
      genus: "Quercus",
    };
    const east: TreeFeat = {
      id: 0,
      at: [10, 20],
      height_m: 12,
      crown_diameter_m: 8,
      trunk_diameter_m: 0.4,
      sizeSource: "vicmap",
      species: "Eucalyptus",
    };
    const ordered = stableExportModel({
      placeLabel: "t",
      center: { lon: 0, lat: 0 },
      sideM: 100,
      layers: { buildings: false, roads: false, waterGreen: false, trees: true },
      buildings: [],
      roads: [],
      areas: [],
      trees: [east, west],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "",
    }).trees;
    expect(ordered.map((tree) => tree.at[0])).toEqual([-5, 10]);
  });
});
