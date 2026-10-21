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

describe("page-square grid", () => {
  const dandenong = { west: 145.2, south: -37.995, east: 145.23, north: -37.98 };

  it("puts each row on one screen row and each column on one screen column (no MGA convergence tilt)", async () => {
    const { pageGridCrosses } = await import("./mgaGridLayer");
    const crosses = pageGridCrosses(dandenong, 100);
    expect(crosses.length).toBeGreaterThan(100);
    const rowY = new Map<number, number>();
    const colX = new Map<number, number>();
    for (const c of crosses) {
      const [x, y] = lonLatToMercator(c.lon, c.lat);
      if (!rowY.has(c.northing)) rowY.set(c.northing, y);
      if (!colX.has(c.easting)) colX.set(c.easting, x);
      expect(y).toBeCloseTo(rowY.get(c.northing)!, 12);
      expect(x).toBeCloseTo(colX.get(c.easting)!, 12);
    }
  });

  it("spaces crosses by the step in ground metres, within 0.5%", async () => {
    const { pageGridCrosses } = await import("./mgaGridLayer");
    const crosses = pageGridCrosses(dandenong, 100);
    const a = crosses[0]!;
    const east = crosses.find((c) => c.northing === a.northing && c.easting === a.easting + 100)!;
    const north = crosses.find((c) => c.easting === a.easting && c.northing === a.northing + 100)!;
    const mPerDegLat = 111_132;
    const mPerDegLon = 111_320 * Math.cos((a.lat * Math.PI) / 180);
    expect(Math.abs((east.lon - a.lon) * mPerDegLon - 100)).toBeLessThan(0.5);
    expect(Math.abs((north.lat - a.lat) * mPerDegLat - 100)).toBeLessThan(0.5);
  });

  it("keeps the same crosses when the cache region moves", async () => {
    const { pageGridCrosses } = await import("./mgaGridLayer");
    const a = new Set(pageGridCrosses(dandenong, 100).map((c) => `${c.easting},${c.northing}`));
    const shifted = pageGridCrosses({ ...dandenong, west: dandenong.west + 0.004, east: dandenong.east + 0.004 }, 100);
    const shared = shifted.filter((c) => a.has(`${c.easting},${c.northing}`));
    expect(shared.length).toBeGreaterThan(shifted.length / 2);
  });

  it("round-trips mercator", async () => {
    const { mercatorToLonLat } = await import("./mgaGridLayer");
    const [lon, lat] = mercatorToLonLat(...lonLatToMercator(145.2149, -37.9875));
    expect(lon).toBeCloseTo(145.2149, 9);
    expect(lat).toBeCloseTo(-37.9875, 9);
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
