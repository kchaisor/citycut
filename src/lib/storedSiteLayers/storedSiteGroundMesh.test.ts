import { describe, expect, it } from "vitest";
import { refineStoredSiteContextPart, storedSitePartIsTerrainDrapeSurface } from "./storedSiteGroundMesh";
import type { StoredSiteMeshPart } from "./types";

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
    expect(refineStoredSiteContextPart(flatGroundPart(900), null)).toBeNull();
  });
});