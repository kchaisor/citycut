import { describe, expect, it } from "vitest";
import { drapedAreaGeometry } from "./buildCity";
import { overlapLift, SURFACE } from "./surfaceLayers";
import { sampleTerrain } from "./terrain";
import type { AreaFeat, TerrainField } from "../types";

function slopedField(): TerrainField {
  return {
    cols: 3,
    rows: 3,
    heights: new Float32Array([0, 5, 10, 0, 5, 10, 0, 5, 10]),
    min: 0,
    max: 10,
    spacingM: 20,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

describe("water draping on terrain", () => {
  it("places draped water vertices at terrain elevation plus the water lift", () => {
    const field = slopedField();
    const sideM = 60;
    const sample = (east: number, north: number) => sampleTerrain(field, east, north, sideM);
    const area: AreaFeat = {
      id: 1,
      kind: "water",
      ring: [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20],
        [-20, -20],
      ],
      holes: [],
    };
    const lift = SURFACE.water.lift + overlapLift(0);
    const geometry = drapedAreaGeometry(area, sample, lift, field.spacingM);
    expect(geometry).toBeTruthy();
    const position = geometry!.getAttribute("position");
    expect(position.count).toBeGreaterThan(6);
    for (let i = 0; i < position.count; i++) {
      const east = position.getX(i);
      const north = -position.getZ(i);
      const expected = sample(east, north) + lift;
      expect(position.getY(i)).toBeCloseTo(expected, 4);
    }
    geometry!.dispose();
  });
});
