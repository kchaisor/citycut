import { describe, expect, it } from "vitest";
import {
  clipStoredSiteMeshPartToFrame,
  storedSiteMeshVerticesInsideFrame,
  type StoredSiteMeshPart,
} from "./scene";

function trianglePart(x0: number, z0: number, x1: number, z1: number, x2: number, z2: number): StoredSiteMeshPart {
  return {
    buildingId: null,
    structure: true,
    positions: new Float32Array([x0, 0, z0, x1, 0, z1, x2, 0, z2]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

describe("stored site mesh frame clip", () => {
  const sideM = 1000;

  it("drops triangles with any vertex outside the square cut", () => {
    const inside = trianglePart(-100, -100, 100, -100, 0, 100);
    const clippedInside = clipStoredSiteMeshPartToFrame(inside, sideM);
    expect(clippedInside).not.toBeNull();
    expect(storedSiteMeshVerticesInsideFrame(clippedInside!, sideM)).toBe(true);

    const straddles = trianglePart(-600, 0, 0, 0, 600, 0);
    expect(clipStoredSiteMeshPartToFrame(straddles, sideM)).toBeNull();
  });

  it("keeps no vertices outside the cut after clip", () => {
    const part = trianglePart(400, 400, 450, 400, 425, 450);
    const clipped = clipStoredSiteMeshPartToFrame(part, sideM);
    expect(clipped).not.toBeNull();
    expect(storedSiteMeshVerticesInsideFrame(clipped!, sideM)).toBe(true);
  });
});