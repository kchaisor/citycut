import { describe, expect, it } from "vitest";
import { drawingModelBuildings } from "./drawingModelBuildings";
import type { BuildingFeat } from "../types";

const city: BuildingFeat = { id: 1, ring: [[0, 0], [1, 0], [1, 1], [0, 0]], holes: [], height: 10, use: "civic", source: "none" };
const imported: BuildingFeat = {
  id: -1,
  ring: [[2, 2], [3, 2], [3, 3], [2, 2]],
  holes: [],
  height: 20,
  use: "unclassified",
  source: "none",
  importedMassing: true,
};

describe("drawingModelBuildings", () => {
  it("includes city and imported footprints when the buildings layer is on", () => {
    expect(drawingModelBuildings([city], [imported], true)).toEqual([city, imported]);
  });

  it("keeps imported footprints when the buildings layer is off", () => {
    expect(drawingModelBuildings([city], [imported], false)).toEqual([imported]);
  });

  it("returns an empty list when buildings are off and there is no import", () => {
    expect(drawingModelBuildings([city], [], false)).toEqual([]);
  });
});
