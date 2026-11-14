import { describe, expect, it } from "vitest";
import { refineStoredSiteContextPart, storedSitePartIsTerrainDrapeSurface, stripStoredSiteContextWaterTriangles } from "./storedSiteGroundMesh";
import type { StoredSiteMeshPart } from "./types";
import type { WaterCutContext } from "../waterSurfaceCut";

function flatGroundPart(span: number): StoredSiteMeshPart {
  const positions = new Float32Array([
    -span / 2,
    0,
    -span / 2,
    span / 2,
    0,
    -span / 2,
    span / 2,
    0,
    span / 2,
    -span / 2,
    0,
    span / 2,
  ]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  return { positions, indices, buildingId: null, structure: true };
}

describe("storedSitePartIsTerrainDrapeSurface", () => {
  it("drops wide planar structure slabs", () => {
    expect(storedSitePartIsTerrainDrapeSurface(flatGroundPart(120))).toBe(true);
  });

  it("keeps compact building parts", () => {
    const part = flatGroundPart(18);
    part.structure = false;
    part.buildingId = 42;
    expect(storedSitePartIsTerrainDrapeSurface(part)).toBe(false);
  });

  it("drops rozelle-scale context slabs without water context", () => {
    expect(refineStoredSiteContextPart(flatGroundPart(900), null).part).toBeNull();
  });

  it("keeps vertical context triangles even when the centroid sits in water", () => {
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 0, 12, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const part: StoredSiteMeshPart = { positions, indices, buildingId: null, structure: true };
    const waterCut: WaterCutContext = {
      areas: [{ ring: [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]], holes: [] }],
      heightAt: () => 0,
    };
    const { part: kept, dropped } = stripStoredSiteContextWaterTriangles(part, waterCut);
    expect(dropped).toBe(0);
    expect(kept?.indices.length).toBe(indices.length);
  });
});