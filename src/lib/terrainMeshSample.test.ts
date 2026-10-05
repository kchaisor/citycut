import { describe, expect, it } from "vitest";
import { sampleTerrain, terrainMeshHeightAt } from "./terrain";
import type { TerrainField } from "../types";

function wedgeField(): TerrainField {
  return {
    cols: 2,
    rows: 2,
    heights: new Float32Array([0, 10, 0, 0]),
    min: 0,
    max: 10,
    spacingM: 10,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

describe("terrainMeshHeightAt", () => {
  it("differs from bilinear inside a cell with a NW spike", () => {
    const field = wedgeField();
    const sideM = 10;
    const east = -2;
    const north = 1;
    const mesh = terrainMeshHeightAt(field, east, north, sideM);
    const bilinear = sampleTerrain(field, east, north, sideM);
    expect(mesh).toBeCloseTo(3, 5);
    expect(bilinear).toBeCloseTo(1.2, 5);
    expect(Math.abs(bilinear - mesh)).toBeGreaterThan(1.5);
  });
});
