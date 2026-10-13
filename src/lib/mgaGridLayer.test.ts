import { describe, expect, it } from "vitest";
import { MGA_GRID_STEPS_M, mgaGridStep } from "./mgaGrid";
import {
  crossFeatures,
  crossImage,
  crossOpacityExpression,
  crossRank,
  crossRegion,
  metresPerPixel,
  MGA_GRID_FADE_ZOOM,
  regionCovers,
  zoomForStep,
} from "./mgaGridLayer";
import { projectLonLat } from "./crs";

// Evaluate the icon-opacity expression for one rank at one zoom (linear interpolate over match).
function opacityAt(expression: unknown[], rank: number, zoom: number): number {
  const stops: [number, number][] = [];
  for (let i = 3; i < expression.length; i += 2) {
    const match = expression[i + 1] as unknown[];
    let value = match[match.length - 1] as number;
    for (let k = 2; k < match.length - 1; k += 2) if (match[k] === rank) value = match[k + 1] as number;
    stops.push([expression[i] as number, value]);
  }
  if (zoom <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i]!;
    const [z0, v0] = stops[i - 1]!;
    if (zoom <= z1) return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0);
  }
  return stops[stops.length - 1]![1];
}

describe("native MGA cross layer", () => {
  const lat = -37.985; // Dandenong

  it("fades each level in from 0 where its step becomes readable, never popping", () => {
    const expression = crossOpacityExpression(lat);
    for (const step of MGA_GRID_STEPS_M.slice(0, -1)) {
      const z0 = zoomForStep(step, lat);
      expect(opacityAt(expression, step, z0 - 0.01)).toBe(0);
      expect(opacityAt(expression, step, z0 + MGA_GRID_FADE_ZOOM / 2)).toBeCloseTo(0.5, 2);
      expect(opacityAt(expression, step, z0 + MGA_GRID_FADE_ZOOM)).toBe(1);
      // Small zoom changes only change opacity a little: no jump anywhere along the ramp.
      for (let z = z0 - 0.2; z < z0 + 0.6; z += 0.01) {
        expect(Math.abs(opacityAt(expression, step, z + 0.01) - opacityAt(expression, step, z))).toBeLessThan(0.03);
      }
    }
  });

  it("matches the readable step: the step chosen at a zoom is the finest level that has started", () => {
    for (const zoom of [12, 13.5, 15, 16.2, 17.8, 19, 20.5]) {
      const step = mgaGridStep(metresPerPixel(zoom, lat));
      expect(zoomForStep(step, lat)).toBeLessThanOrEqual(zoom + 1e-9);
    }
  });

  it("ranks a cross by the coarsest step it sits on", () => {
    expect(crossRank(345000, 5795000, 10)).toBe(5000);
    expect(crossRank(342000, 5795000, 10)).toBe(1000);
    expect(crossRank(342500, 5795000, 10)).toBe(500);
    expect(crossRank(342510, 5795000, 10)).toBe(10);
    expect(crossRank(350000, 5800000, 100)).toBe(50000);
  });

  it("puts features exactly on whole-step MGA intersections, with no screen rounding", () => {
    const bounds = { west: 145.214, south: -37.988, east: 145.224, north: -37.982 };
    const region = crossRegion(bounds, 100);
    const data = crossFeatures(region);
    expect(data.features.length).toBeGreaterThan(20);
    for (const f of data.features) {
      const [e, n] = projectLonLat(f.geometry.coordinates[0]!, f.geometry.coordinates[1]!, 55);
      expect(Math.abs(e - Math.round(e / 100) * 100)).toBeLessThan(0.01);
      expect(Math.abs(n - Math.round(n / 100) * 100)).toBeLessThan(0.01);
      expect(f.properties.rank % 100).toBe(0);
    }
    expect(regionCovers(region, bounds, 100)).toBe(true);
    expect(regionCovers(region, bounds, 50)).toBe(false);
    expect(regionCovers(region, { ...bounds, east: region.east + 0.001 }, 100)).toBe(false);
  });

  it("draws a thin cross image with no halo", () => {
    const img = crossImage(6, [26, 25, 22, 255], 1);
    expect(img.width).toBe(13);
    const alpha = (x: number, y: number) => img.data[(y * 13 + x) * 4 + 3];
    expect(alpha(6, 0)).toBe(255);
    expect(alpha(0, 6)).toBe(255);
    expect(alpha(5, 0)).toBe(0);
    expect(alpha(7, 3)).toBe(0);
    const opaque = Array.from({ length: 169 }, (_, i) => img.data[i * 4 + 3]).filter((a) => a > 0).length;
    expect(opaque).toBe(25);
  });
});
