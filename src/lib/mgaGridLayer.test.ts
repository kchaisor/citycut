import { describe, expect, it } from "vitest";
import {
  buildCache,
  cacheCovers,
  crossVertices,
  finestVisibleStep,
  levelOpacity,
  lonLatToMercator,
  metresPerPixel,
  MGA_GRID_FADE_FULL_PX,
  MGA_GRID_FADE_START_PX,
  translateMatrix,
} from "./mgaGridLayer";
import { MGA_GRID_STEPS_M } from "./mgaGrid";

const LAT = -37.81;
const view = { west: 144.955, south: -37.818, east: 144.975, north: -37.806 };

describe("MGA cross levels", () => {
  it("never leaves a zoom with zero fully visible crosses, from z10 to z22 in 0.01 steps", () => {
    for (let z = 10; z <= 22; z += 0.01) {
      const mpp = metresPerPixel(z, LAT);
      const opaque = MGA_GRID_STEPS_M.filter((s) => levelOpacity(s, mpp) === 1);
      if (MGA_GRID_STEPS_M[0]! / mpp >= MGA_GRID_FADE_FULL_PX) expect(opaque.length).toBeGreaterThan(0);
      expect(MGA_GRID_STEPS_M.some((s) => levelOpacity(s, mpp) > 0)).toBe(true);
    }
  });

  it("fades continuously: opacity changes by less than 0.05 per 0.01 zoom", () => {
    for (const step of MGA_GRID_STEPS_M) {
      let prev = levelOpacity(step, metresPerPixel(10, LAT));
      for (let z = 10.01; z <= 22; z += 0.01) {
        const next = levelOpacity(step, metresPerPixel(z, LAT));
        expect(Math.abs(next - prev)).toBeLessThan(0.05);
        prev = next;
      }
    }
  });

  it("fades between the start and full gaps", () => {
    expect(levelOpacity(100, 100 / (MGA_GRID_FADE_START_PX - 1))).toBe(0);
    expect(levelOpacity(100, 100 / (MGA_GRID_FADE_FULL_PX + 1))).toBe(1);
    const mid = levelOpacity(100, 100 / ((MGA_GRID_FADE_START_PX + MGA_GRID_FADE_FULL_PX) / 2));
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });

  it("keeps 10 m as the finest step", () => {
    expect(finestVisibleStep(metresPerPixel(24, LAT))).toBe(10);
  });
});

describe("cross cache", () => {
  it("covers the view and is reused while the view stays inside it", () => {
    const cache = buildCache(view, 100);
    expect(cacheCovers(cache, view, 100)).toBe(true);
    expect(cacheCovers(cache, view, 50)).toBe(false);
    expect(cacheCovers(null, view, 100)).toBe(false);
    const total = [...cache.ranks.values()].reduce((n, a) => n + a.length / 2, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("cross geometry", () => {
  it("builds 3 non-overlapping quads per cross", () => {
    const v = crossVertices([0.1, 0.2, 0.3, 0.4], 6);
    expect(v.count).toBe(36);
    expect(v.centres[0]).toBeCloseTo(0.1);
    expect(Math.max(...v.offsets)).toBe(6);
  });

  it("maps lon/lat to MapLibre mercator units", () => {
    expect(lonLatToMercator(0, 0)).toEqual([0.5, 0.5]);
    const [x, y] = lonLatToMercator(144.96, LAT);
    expect(x).toBeCloseTo(0.9027, 3);
    expect(y).toBeGreaterThan(0.5);
  });

  it("translates the matrix in float64", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m = translateMatrix(identity, 0.25, 0.75);
    expect(m[12]).toBe(0.25);
    expect(m[13]).toBe(0.75);
  });
});
