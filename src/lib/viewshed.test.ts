import { describe, expect, it } from "vitest";
import {
  CELL_BLOCKED,
  CELL_OUTSIDE,
  CELL_VISIBLE,
  frameVisibleShare,
  spacedSplineSamples,
  viewshedFrame,
  walkGridBox,
  type HeightGrid,
} from "./viewshed";
import type { Pt } from "../types";

function flatGrid(cols: number, rows: number, cell = 1): HeightGrid {
  const n = cols * rows;
  return {
    cols,
    rows,
    x0: 0,
    y0: 0,
    cell,
    ground: new Float32Array(n),
    surface: new Float32Array(n),
    covered: new Uint8Array(n),
  };
}

function wall(grid: HeightGrid, col: number, rowFrom: number, rowTo: number, height: number) {
  for (let r = rowFrom; r <= rowTo; r++) {
    const k = r * grid.cols + col;
    grid.surface[k] = height;
    grid.covered[k] = 1;
  }
}

const at = (grid: HeightGrid, frame: Uint8Array, c: number, r: number) => frame[r * grid.cols + c];

describe("spacedSplineSamples", () => {
  it("samples a straight line every ~3 m from the first click to the last", () => {
    const { samples, lengthM } = spacedSplineSamples([
      [0, 0],
      [90, 0],
    ]);
    expect(lengthM).toBeCloseTo(90, 3);
    expect(samples).toHaveLength(31);
    expect(samples[0]![0]).toBeCloseTo(0, 6);
    expect(samples.at(-1)![0]).toBeCloseTo(90, 6);
    for (let i = 1; i < samples.length; i++) {
      expect(Math.hypot(samples[i]![0] - samples[i - 1]![0], samples[i]![1] - samples[i - 1]![1])).toBeCloseTo(3, 2);
    }
  });

  it("passes through every click on a curved path with even spacing", () => {
    const clicks: Pt[] = [
      [0, 0],
      [40, 30],
      [80, 0],
      [120, 40],
    ];
    const { samples, lengthM } = spacedSplineSamples(clicks, 3);
    expect(samples.length).toBe(Math.round(lengthM / 3) + 1);
    expect(samples[0]).toEqual([0, 0]);
    expect(samples.at(-1)![0]).toBeCloseTo(120, 4);
    expect(samples.at(-1)![1]).toBeCloseTo(40, 4);
    for (const [e, n] of clicks) {
      const nearest = Math.min(...samples.map(([x, y]) => Math.hypot(x - e, y - n)));
      expect(nearest).toBeLessThan(1.6);
    }
    const gaps = samples.slice(1).map((p, i) => Math.hypot(p[0] - samples[i]![0], p[1] - samples[i]![1]));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.15);
  });

  it("ignores repeated clicks and needs two distinct points", () => {
    expect(spacedSplineSamples([[5, 5]]).samples).toHaveLength(1);
    expect(spacedSplineSamples([[5, 5], [5, 5]]).lengthM).toBe(0);
  });
});

describe("viewshedFrame on a synthetic grid", () => {
  it("sees all open flat ground within the radius", () => {
    const grid = flatGrid(41, 41);
    const frame = viewshedFrame(grid, 20.5, 20.5, 1.6, 15);
    expect(at(grid, frame, 30, 20)).toBe(CELL_VISIBLE);
    expect(at(grid, frame, 20, 10)).toBe(CELL_VISIBLE);
    expect(frameVisibleShare(frame).percent).toBe(100);
  });

  it("marks cells beyond the radius as outside", () => {
    const grid = flatGrid(41, 41);
    const frame = viewshedFrame(grid, 20.5, 20.5, 1.6, 10);
    expect(at(grid, frame, 20, 28)).toBe(CELL_VISIBLE);
    expect(at(grid, frame, 20, 33)).toBe(CELL_OUTSIDE);
    expect(at(grid, frame, 0, 0)).toBe(CELL_OUTSIDE);
  });

  it("blocks the ground behind a wall and leaves the near side visible", () => {
    const grid = flatGrid(41, 41);
    wall(grid, 25, 10, 30, 10);
    const frame = viewshedFrame(grid, 20.5, 20.5, 1.6, 20);
    expect(at(grid, frame, 23, 20)).toBe(CELL_VISIBLE);
    expect(at(grid, frame, 28, 20)).toBe(CELL_BLOCKED);
    expect(at(grid, frame, 35, 20)).toBe(CELL_BLOCKED);
    expect(at(grid, frame, 15, 20)).toBe(CELL_VISIBLE);
    // Covered cells (the wall itself) are not scored.
    expect(at(grid, frame, 25, 20)).toBe(CELL_OUTSIDE);
  });

  it("sees over a wall lower than the sight line from a raised eye", () => {
    const grid = flatGrid(41, 41);
    wall(grid, 24, 10, 30, 1.4);
    const low = viewshedFrame(grid, 20.5, 20.5, 1.6, 20);
    const high = viewshedFrame(grid, 20.5, 20.5, 30, 20);
    expect(at(grid, low, 35, 20)).toBe(CELL_BLOCKED);
    expect(at(grid, high, 35, 20)).toBe(CELL_VISIBLE);
  });
});

describe("viewshedFrame from inside a footprint", () => {
  it("looks out from the edge of the building it stands in, and is still blocked by the next one", () => {
    const grid = flatGrid(41, 41);
    for (let c = 18; c <= 22; c++) wall(grid, c, 18, 22, 10);
    wall(grid, 30, 10, 30, 10);
    const frame = viewshedFrame(grid, 20.5, 20.5, 1.6, 20);
    expect(at(grid, frame, 25, 20)).toBe(CELL_VISIBLE);
    expect(at(grid, frame, 20, 10)).toBe(CELL_VISIBLE);
    expect(at(grid, frame, 35, 20)).toBe(CELL_BLOCKED);
  });
});

describe("walkGridBox", () => {
  it("pads the path by the radius and clips to the cut", () => {
    expect(walkGridBox([[0, 0], [100, 50]], 200, 500)).toEqual({ x0: -200, y0: -200, x1: 250, y1: 250 });
  });
});
