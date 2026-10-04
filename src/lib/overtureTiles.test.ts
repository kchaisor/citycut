import { describe, expect, it } from "vitest";
import { dedupeConsecutive } from "./geo";
import { clipPolylineRect } from "./clip";
import { clipPolylineToRect, lineFromGeoJson } from "./overtureTiles";
import { maxConsecutiveJump } from "./roadLineValidation";
import type { Pt } from "../types";

/** Previous tile clip: half-plane chain that chorded across outside gaps. */
function clipPolylineToRectLegacy(line: Pt[], rect: { minE: number; maxE: number; minN: number; maxN: number }): Pt[][] {
  let current = line.slice();
  const slack = 1e-6;
  const clipHalfLine = (
    input: Pt[],
    inside: (p: Pt) => boolean,
    intersect: (a: Pt, b: Pt) => Pt,
  ): Pt[] => {
    if (input.length === 0) return [];
    const output: Pt[] = [];
    let previous = input[input.length - 1];
    let previousInside = inside(previous);
    for (const point of input) {
      const currentInside = inside(point);
      if (currentInside) {
        if (!previousInside) output.push(intersect(previous, point));
        output.push(point);
      } else if (previousInside) {
        output.push(intersect(previous, point));
      }
      previous = point;
      previousInside = currentInside;
    }
    return output;
  };
  const hitX = (a: Pt, b: Pt, x: number): Pt => {
    const dx = b[0] - a[0];
    if (Math.abs(dx) < 1e-12) return [x, a[1]];
    const t = (x - a[0]) / dx;
    return [x, a[1] + (b[1] - a[1]) * t];
  };
  const hitY = (a: Pt, b: Pt, y: number): Pt => {
    const dy = b[1] - a[1];
    if (Math.abs(dy) < 1e-12) return [a[0], y];
    const t = (y - a[1]) / dy;
    return [a[0] + (b[0] - a[0]) * t, y];
  };
  current = clipHalfLine(current, (p) => p[0] >= rect.minE - slack, (a, b) => hitX(a, b, rect.minE));
  current = clipHalfLine(current, (p) => p[0] <= rect.maxE + slack, (a, b) => hitX(a, b, rect.maxE));
  current = clipHalfLine(current, (p) => p[1] >= rect.minN - slack, (a, b) => hitY(a, b, rect.minN));
  current = clipHalfLine(current, (p) => p[1] <= rect.maxN + slack, (a, b) => hitY(a, b, rect.maxN));
  if (current.length < 2) return [];
  return [dedupeConsecutive(current, 0.1)];
}

describe("clipPolylineToRect", () => {
  const rect = { minE: 0, maxE: 100, minN: 0, maxN: 100 };

  it("returns separate parts when the source line leaves and re-enters the tile", () => {
    const line: Pt[] = [
      [50, 50],
      [200, 200],
      [50, 80],
    ];
    const parts = clipPolylineRect(line, rect);
    expect(parts.length).toBe(2);
    for (const part of parts) {
      expect(maxConsecutiveJump(part)).toBeLessThan(120);
    }
    expect(clipPolylineToRectLegacy(line, rect)).toHaveLength(1);
    expect(clipPolylineToRect(line, rect).length).toBe(2);
  });

  it("splits two inside runs separated by an outside detour", () => {
    const line: Pt[] = [
      [20, 50],
      [40, 50],
      [40, 200],
      [80, 50],
      [95, 50],
    ];
    expect(clipPolylineToRectLegacy(line, rect)).toHaveLength(1);
    expect(clipPolylineToRect(line, rect).length).toBeGreaterThan(1);
  });

  it("clips the same centerline per tile without long jumps", () => {
    const origin = { lat: -37.794, lon: 144.945 };
    const coords = [
      [144.9445, -37.794],
      [144.9455, -37.7942],
      [144.9465, -37.7944],
    ];
    const half = 400;
    const rectA = { minE: -400, maxE: 0, minN: -400, maxN: 400 };
    const rectB = { minE: 0, maxE: 400, minN: -400, maxN: 400 };
    const clipA = lineFromGeoJson(coords, origin, half, rectA);
    const clipB = lineFromGeoJson(coords, origin, half, rectB);
    const merged = [...clipA, ...clipB];
    expect(merged.length).toBeGreaterThan(0);
    for (const part of merged) {
      expect(maxConsecutiveJump(part)).toBeLessThan(800);
    }
  });
});
