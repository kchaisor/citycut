import { describe, expect, it } from "vitest";
import {
  BRIDGE_DECK_CLEARANCE_M,
  closestParameter,
  constrainTrisToTerrainGrid,
  deckHeightAt,
  splitTriByLine,
  type Tri,
} from "./roadDrape";
import { terrainMeshHeightAt } from "./terrain";
import type { TerrainField } from "../types";

function cuttingField(): TerrainField {
  const cols = 5;
  const rows = 3;
  const heights = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      heights[row * cols + col] = col === 2 ? 0 : 8;
    }
  }
  return {
    cols,
    rows,
    heights,
    min: 0,
    max: 8,
    spacingM: 10,
    zoom: 14,
    metresPerPixel: 4,
    source: "Mapterhorn",
  };
}

describe("constrainTrisToTerrainGrid", () => {
  it("splits a long triangle so no piece crosses a grid line or SW–NE diagonal", () => {
    const field = cuttingField();
    const sideM = 40;
    const wide: Tri = [
      [-18, -4],
      [18, -4],
      [18, 4],
    ];
    const parts = constrainTrisToTerrainGrid([wide], field, sideM);
    expect(parts.length).toBeGreaterThan(1);
    const half = sideM / 2;
    for (const [a, b, c] of parts) {
      const cols = [a, b, c].map((point) => Math.floor((point[0] + half) / field.spacingM + 1e-9));
      const rows = [a, b, c].map((point) => Math.floor((point[1] + half) / field.spacingM + 1e-9));
      expect(Math.max(...cols) - Math.min(...cols)).toBeLessThanOrEqual(1);
      expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps a triangle that already sits in one mesh triangle", () => {
    const field = cuttingField();
    const sideM = 40;
    const cell: Tri = [
      [-20, -20],
      [-10.2, -20],
      [-12, -18],
    ];
    const parts = constrainTrisToTerrainGrid([cell], field, sideM);
    expect(parts).toHaveLength(1);
  });
});

describe("splitTriByLine", () => {
  it("bisects a triangle that straddles a vertical line", () => {
    const tri: Tri = [
      [-10, 0],
      [10, 0],
      [0, 8],
    ];
    const parts = splitTriByLine(tri, (point) => point[0]);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      const xs = part.map((point) => point[0]);
      expect(Math.max(...xs) <= 1e-6 || Math.min(...xs) >= -1e-6).toBe(true);
    }
  });
});

describe("deckHeightAt", () => {
  const line: [number, number][] = [
    [0, 0],
    [100, 0],
  ];
  const sample = (east: number) => (east < 50 ? 2 : 8);

  it("meets the abutment ground at each end", () => {
    expect(deckHeightAt(line, sample, 0, 0)).toBeCloseTo(2, 5);
    expect(deckHeightAt(line, sample, 100, 0)).toBeCloseTo(8, 5);
  });

  it("is a linear ramp plus clearance at mid-span", () => {
    const mid = deckHeightAt(line, sample, 50, 0);
    expect(mid).toBeCloseTo(5 + BRIDGE_DECK_CLEARANCE_M, 5);
  });

  it("finds the closest parameter along the centreline", () => {
    expect(closestParameter(line, [25, 4])).toBeCloseTo(0.25, 5);
  });
});

describe("mesh sampling used for road drape", () => {
  it("puts a vertex on the cutting floor, not a bilinear chord", () => {
    const field = cuttingField();
    const sideM = 40;
    const mesh = terrainMeshHeightAt(field, 0, 0, sideM);
    expect(mesh).toBeCloseTo(0, 5);
  });
});
