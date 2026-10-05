import { describe, expect, it } from "vitest";
import { sampleTerrain, terrainBuffers, terrainMeshHeightAt } from "./terrain";
import type { TerrainField } from "../types";

function neSpikeField(): TerrainField {
  return {
    cols: 2,
    rows: 2,
    heights: new Float32Array([0, 0, 0, 10]),
    min: 0,
    max: 10,
    spacingM: 10,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

describe("terrainMeshHeightAt", () => {
  it("matches terrain-mesh vertices and the SW–NE split, not bilinear", () => {
    const field = neSpikeField();
    const sideM = 10;
    expect(terrainMeshHeightAt(field, -5, -5, sideM)).toBeCloseTo(0, 8);
    expect(terrainMeshHeightAt(field, 5, -5, sideM)).toBeCloseTo(0, 8);
    expect(terrainMeshHeightAt(field, -5, 5, sideM)).toBeCloseTo(0, 8);
    expect(terrainMeshHeightAt(field, 5, 5, sideM)).toBeCloseTo(10, 8);

    const se = terrainMeshHeightAt(field, 3, -3, sideM);
    const nw = terrainMeshHeightAt(field, -3, 3, sideM);
    const bilinearSe = sampleTerrain(field, 3, -3, sideM);
    expect(se).toBeCloseTo(2, 5);
    expect(nw).toBeCloseTo(2, 5);
    expect(bilinearSe).toBeCloseTo(1.6, 5);
    expect(Math.abs(se - bilinearSe)).toBeGreaterThan(0.3);

    const buffers = terrainBuffers(field, sideM);
    expect(buffers.positions[1]).toBeCloseTo(0, 8);
    expect(buffers.positions[10]).toBeCloseTo(10, 8);
  });
});
