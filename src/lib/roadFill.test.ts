import { describe, expect, it } from "vitest";
import type { MultiPolygon, Pair } from "polygon-clipping";
import { unionCarriageways } from "./roadFill";

function openRing(ring: Pair[]): Pair[] {
  if (
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  ) {
    return ring.slice(0, -1);
  }
  return ring;
}

function inside(multi: MultiPolygon, x: number, y: number): boolean {
  let hits = 0;
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = openRing(ring);
      for (let i = 0, j = open.length - 1; i < open.length; j = i++) {
        const yi = open[i][1];
        const yj = open[j][1];
        if (yi > y === yj > y) continue;
        const xCross = ((open[j][0] - open[i][0]) * (y - yi)) / (yj - yi) + open[i][0];
        if (x < xCross) hits += 1;
      }
    }
  }
  return hits % 2 === 1;
}

/** An internal seam has the fill on both sides of an edge. A real kerb does not. */
function hasInternalSeam(multi: MultiPolygon): boolean {
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = openRing(ring);
      for (let i = 0; i < open.length; i++) {
        const a = open[i];
        const b = open[(i + 1) % open.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) continue;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const nx = (-dy / length) * 0.25;
        const ny = (dx / length) * 0.25;
        if (inside(multi, mx + nx, my + ny) === inside(multi, mx - nx, my - ny)) return true;
      }
    }
  }
  return false;
}

function circle(radius: number, segments = 16): Pair[] {
  const points: Pair[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

describe("road union", () => {
  it("joins a crossing, a bend, and a cul-de-sac into one shape with no internal seams", () => {
    const fill = unionCarriageways(
      [
        { line: [[-30, 0], [30, 0]], width: 8 },
        { line: [[0, -30], [0, 30]], width: 8 },
        { line: [[30, 0], [30, 24]], width: 8 },
        { line: [[18, 24], [46, 24]], width: 6 },
      ],
      200,
    );
    expect(fill.polygons).toHaveLength(1);
    expect(fill.polygons[0].slice(1)).toHaveLength(0);
    expect(inside(fill.polygons, 0, 0)).toBe(true);
    expect(inside(fill.polygons, 30, 12)).toBe(true);
    expect(inside(fill.polygons, 32, 24)).toBe(true);
    expect(inside(fill.polygons, 20, 10)).toBe(false);
    expect(inside(fill.polygons, 46 + 2, 24)).toBe(true);
    expect(inside(fill.polygons, 46 + 5, 24)).toBe(false);
    expect(hasInternalSeam(fill.polygons)).toBe(false);
  });

  it("keeps a roundabout island as a hole and still has no seam where a road joins", () => {
    const fill = unionCarriageways(
      [
        { line: circle(18), width: 6 },
        { line: [[18, 0], [40, 0]], width: 6 },
      ],
      200,
    );
    expect(fill.polygons).toHaveLength(1);
    expect(fill.polygons[0].length).toBeGreaterThan(1);
    expect(inside(fill.polygons, 0, 0)).toBe(false);
    expect(inside(fill.polygons, 18, 0)).toBe(true);
    expect(inside(fill.polygons, 30, 0)).toBe(true);
    expect(hasInternalSeam(fill.polygons)).toBe(false);
  });
});
