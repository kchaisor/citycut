import { describe, expect, it } from "vitest";
import { contourRings, ringArea, smoothRing, smoothRingPasses } from "./marchingSquares";

function grid(rows: number[][]) {
  return { values: rows.flat(), cols: rows[0]!.length, rows: rows.length };
}

function closedKeys(ring: Float64Array): boolean {
  const n = ring.length / 2;
  const seen = new Set<string>();
  for (let p = 0; p < n; p++) seen.add(`${ring[p * 2]},${ring[p * 2 + 1]}`);
  return seen.size === n && n >= 3;
}

describe("contourRings", () => {
  it("returns nothing when the field never reaches the level", () => {
    expect(contourRings(grid([[0, 0], [0, 0]]), 0.5)).toEqual([]);
  });

  it("closes a ring around a single peak with interpolated edges", () => {
    const rings = contourRings(
      grid([
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ]),
      0.25,
    );
    expect(rings).toHaveLength(1);
    const ring = rings[0]!;
    expect(closedKeys(ring)).toBe(true);
    const xs = Array.from(ring.filter((_, k) => k % 2 === 0));
    expect(xs).toContain(0.25);
    expect(xs).toContain(1.75);
    expect(Math.abs(ringArea(ring))).toBeCloseTo(2 * 0.75 * 0.75, 9);
  });

  it("puts a crossing at the interpolated fraction, not on a cell corner", () => {
    const rings = contourRings(grid([[0, 1, 1, 1]]), 0.3);
    const ring = rings[0]!;
    const xs = Array.from(ring.filter((_, k) => k % 2 === 0));
    expect(Math.min(...xs)).toBeCloseTo(0.3, 9);
    expect(xs.some((x) => Math.abs(x - Math.round(x)) > 1e-6 && Math.abs(x - Math.round(x)) !== 0.5)).toBe(true);
  });

  it("closes rings that touch the grid edge", () => {
    const rings = contourRings(
      grid([
        [1, 1, 0],
        [1, 1, 0],
        [0, 0, 0],
      ]),
      0.5,
    );
    expect(rings).toHaveLength(1);
    const ring = rings[0]!;
    expect(closedKeys(ring)).toBe(true);
    const xs = Array.from(ring.filter((_, k) => k % 2 === 0));
    const ys = Array.from(ring.filter((_, k) => k % 2 === 1));
    expect(Math.min(...xs)).toBeCloseTo(-0.5, 9);
    expect(Math.min(...ys)).toBeCloseTo(-0.5, 9);
    expect(Math.max(...xs)).toBeCloseTo(1.5, 9);
  });

  it("keeps a hole as its own ring", () => {
    const rings = contourRings(
      grid([
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 0, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ]),
      0.5,
    );
    expect(rings).toHaveLength(2);
    for (const ring of rings) expect(closedKeys(ring)).toBe(true);
  });

  it("separates two peaks into two rings", () => {
    const rings = contourRings(
      grid([
        [1, 0, 0, 1],
        [0, 0, 0, 0],
      ]),
      0.5,
    );
    expect(rings).toHaveLength(2);
  });
});

describe("smoothRing", () => {
  it("doubles the vertices and stays inside the original hull", () => {
    const square = Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1]);
    const smooth = smoothRing(square);
    expect(smooth.length).toBe(16);
    for (const v of smooth) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("smoothRingPasses", () => {
  const peak = () =>
    contourRings(
      grid([
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 1, 2, 1, 0],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0],
      ]),
      0.5,
    )[0]!;

  it("matches one Chaikin pass for a single pass and leaves the ring alone for none", () => {
    const ring = peak();
    expect(smoothRingPasses(ring, 1)).toEqual(smoothRing(ring));
    expect(smoothRingPasses(ring, 0)).toBe(ring);
  });

  it("keeps a twice-smoothed ring closed, distinct and inside the first pass", () => {
    const ring = peak();
    const once = smoothRingPasses(ring, 1);
    const twice = smoothRingPasses(ring, 2);
    expect(twice.length).toBe(once.length * 2);
    expect(closedKeys(twice)).toBe(true);
    expect(Math.abs(ringArea(twice))).toBeLessThan(Math.abs(ringArea(once)));
    expect(Math.abs(ringArea(twice))).toBeGreaterThan(Math.abs(ringArea(ring)) * 0.85);
    expect(Math.sign(ringArea(twice))).toBe(Math.sign(ringArea(ring)));
  });
});
