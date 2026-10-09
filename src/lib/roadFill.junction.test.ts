import { describe, expect, it } from "vitest";
import type { MultiPolygon, Pair } from "polygon-clipping";
import { clearAllRoadFillCachesForTests, unionFootpathStrips } from "./roadFill";
import type { Pt } from "../types";

function openRing(ring: Pair[]): Pair[] {
  if (
    ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
  ) {
    return ring.slice(0, -1);
  }
  return ring;
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function minDistToPolyline(line: Pt[], px: number, py: number): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    best = Math.min(
      best,
      distPointToSegment(px, py, line[i]![0], line[i]![1], line[i + 1]![0], line[i + 1]![1]),
    );
  }
  return best;
}

/** Signed side: positive = left of polyline direction. */
function maxOuterBulge(main: Pt[], half: number, multi: MultiPolygon, side: "left" | "right"): number {
  let maxBulge = 0;
  for (const polygon of multi) {
    const outer = openRing(polygon[0] ?? []);
    for (const [x, y] of outer) {
      const d = minDistToPolyline(main, x, y);
      const bulge = d - half;
      if (bulge <= 0) continue;
      const near = nearestSegment(main, x, y);
      if (!near) continue;
      const cross =
        (near.bx - near.ax) * (y - near.ay) - (near.by - near.ay) * (x - near.ax);
      const isLeft = cross > 0;
      if ((side === "left" && isLeft) || (side === "right" && !isLeft)) {
        maxBulge = Math.max(maxBulge, bulge);
      }
    }
  }
  return maxBulge;
}

function nearestSegment(line: Pt[], px: number, py: number) {
  let best = Infinity;
  let seg: { ax: number; ay: number; bx: number; by: number } | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distPointToSegment(px, py, line[i]![0], line[i]![1], line[i + 1]![0], line[i + 1]![1]);
    if (d < best) {
      best = d;
      seg = { ax: line[i]![0], ay: line[i]![1], bx: line[i + 1]![0], by: line[i + 1]![1] };
    }
  }
  return seg;
}

describe("T junction outer edge", () => {
  it("keeps the main path outer edge within r + 0.05 m at a slight bend", () => {
    clearAllRoadFillCachesForTests();
    const width = 2.4;
    const half = width / 2;
    const junction: Pt = [20, 0];
    const strips = [
      { line: [[0, 0], junction] as Pt[], width },
      { line: [junction, [40, 6]] as Pt[], width },
      { line: [junction, [20, -28]] as Pt[], width },
    ];
    const filleted = unionFootpathStrips(strips, 200, "square", 2, width);
    const main: Pt[] = [
      [0, 0],
      junction,
      [40, 6],
    ];
    const bulge = maxOuterBulge(main, half, filleted.polygons, "left");
    expect(bulge).toBeLessThanOrEqual(0.05);
  });
});
