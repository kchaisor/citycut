import { describe, expect, it } from "vitest";
import { drapedAreaGeometry } from "./buildCity";
import { overlapLift, SURFACE } from "./surfaceLayers";
import { sampleTerrain } from "./terrain";
import { bufferGeometryVerticesInsideSiteFrame, clipBufferGeometryToSiteFrame } from "./siteFrameMesh";
import type { AreaFeat, TerrainField } from "../types";

function slopedField(): TerrainField {
  return {
    cols: 5,
    rows: 5,
    heights: new Float32Array([0, 2, 4, 2, 0, 0, 2, 4, 2, 0, 0, 2, 4, 2, 0, 0, 2, 4, 2, 0, 0, 2, 4, 2, 0]),
    min: 0,
    max: 4,
    spacingM: 250,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

describe("site frame mesh clip", () => {
  it("removes water triangles outside the cut", () => {
    const sideM = 1000;
    const field = slopedField();
    const sample = (east: number, north: number) => sampleTerrain(field, east, north, sideM);
    const area: AreaFeat = {
      id: 1,
      kind: "water",
      ring: [
        [-800, -800],
        [800, -800],
        [800, 800],
        [-800, 800],
        [-800, -800],
      ],
      holes: [],
    };
    const lift = SURFACE.water.lift + overlapLift(0);
    const draped = drapedAreaGeometry(area, sample, lift, field.spacingM)!;
    const clipped = clipBufferGeometryToSiteFrame(draped, sideM)!;
    draped.dispose();
    expect(bufferGeometryVerticesInsideSiteFrame(clipped, sideM)).toBe(true);
    clipped.dispose();
  });

  it("keeps water fill inside the frame", () => {
    const sideM = 1000;
    const field = slopedField();
    const sample = (east: number, north: number) => sampleTerrain(field, east, north, sideM);
    const area: AreaFeat = {
      id: 2,
      kind: "water",
      ring: [
        [-200, -200],
        [200, -200],
        [200, 200],
        [-200, 200],
        [-200, -200],
      ],
      holes: [],
    };
    const geometry = drapedAreaGeometry(area, sample, SURFACE.water.lift, field.spacingM)!;
    const clipped = clipBufferGeometryToSiteFrame(geometry, sideM);
    geometry.dispose();
    expect(clipped).not.toBeNull();
    expect(bufferGeometryVerticesInsideSiteFrame(clipped!, sideM)).toBe(true);
    clipped!.dispose();
  });
});