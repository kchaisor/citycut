import { describe, expect, it } from "vitest";
import {
  circleRing,
  detectRoundabouts,
  fitCircle,
  osmWayKey,
  ROUNDABOUT_SEGMENTS,
  smoothIslandRing,
  withRoundaboutIslands,
} from "./roundabouts";
import { signedArea } from "./geo";
import type { AreaFeat, Pt } from "../types";

const poly = (c: Pt, r: number, n: number, phase = 0.3): Pt[] =>
  Array.from({ length: n }, (_, i): Pt => [c[0] + r * Math.cos(phase + (i / n) * 2 * Math.PI), c[1] + r * Math.sin(phase + (i / n) * 2 * Math.PI)]);

/** A z14-style roundabout ring: 4 segments of 3 vertices each, from one OSM way. */
function ringSegments(c: Pt, r: number, key = "w1"): { key: string; line: Pt[]; width: number }[] {
  const pts = poly(c, r, 8);
  return [0, 2, 4, 6].map((i) => ({ key, width: 5.5, line: [pts[i]!, pts[i + 1]!, pts[(i + 2) % 8]!] }));
}

describe("roundabouts", () => {
  it("reads the OSM way key from Overture sources", () => {
    expect(osmWayKey({ sources: '[{"record_id":"w32921419@17","dataset":"OpenStreetMap"}]' })).toBe("w32921419");
    expect(osmWayKey({ sources: '[{"record_id":"n5@1"}]' })).toBeNull();
    expect(osmWayKey({})).toBeNull();
  });

  it("fits a circle exactly to points on one", () => {
    const fit = fitCircle(poly([10, -4], 9, 7))!;
    expect(fit.center[0]).toBeCloseTo(10, 6);
    expect(fit.center[1]).toBeCloseTo(-4, 6);
    expect(fit.radius).toBeCloseTo(9, 6);
  });

  it("detects a ring cut into segments, not an open arc or a straight street", () => {
    const parts = [
      ...ringSegments([0, 0], 10, "w1"),
      // Half a ring (cut by the frame): not closed.
      ...ringSegments([100, 0], 10, "w2").slice(0, 2),
      // Straight street.
      { key: "w3", width: 7, line: [[0, 50], [40, 50], [80, 50], [120, 50]] as Pt[] },
      // Too large to be a roundabout.
      ...ringSegments([0, 300], 120, "w4"),
    ];
    const found = detectRoundabouts(parts);
    expect(found.map((rb) => rb.key)).toEqual(["w1"]);
    expect(found[0]!.radius).toBeCloseTo(10, 1);
    expect(found[0]!.width).toBe(5.5);
  });

  it("adds a smooth island where none is mapped (radius = ring less half the carriageway)", () => {
    const areas: AreaFeat[] = [{ id: 1, kind: "green", ring: [[200, 200], [260, 200], [260, 230], [200, 230]], holes: [] }];
    const out = withRoundaboutIslands(areas, [{ key: "w1", center: [0, 0], radius: 10, width: 5.5 }]);
    expect(out).toHaveLength(2);
    const island = out[1]!;
    expect(island.kind).toBe("green");
    expect(island.ring).toHaveLength(ROUNDABOUT_SEGMENTS + 1);
    for (const p of island.ring) expect(Math.hypot(p[0], p[1])).toBeCloseTo(7.25, 6);
    expect(out[0]).toBe(areas[0]);
  });

  it("replaces a faceted mapped island with a circle of the same area", () => {
    const octagon = poly([1, 1], 8, 8);
    const out = withRoundaboutIslands([{ id: 7, kind: "green", ring: octagon, holes: [] }], [{ key: "w1", center: [0, 0], radius: 13, width: 5.5 }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.ring).toHaveLength(ROUNDABOUT_SEGMENTS + 1);
    expect(Math.abs(signedArea(out[0]!.ring))).toBeCloseTo(Math.abs(signedArea(octagon)), -0.5);
  });

  it("smooths near-circular small green rings only", () => {
    const round = smoothIslandRing({ id: 1, kind: "green", ring: poly([0, 0], 9, 9), holes: [] });
    expect(round.ring).toHaveLength(ROUNDABOUT_SEGMENTS + 1);
    const rect: AreaFeat = { id: 2, kind: "green", ring: [[0, 0], [30, 0], [30, 8], [0, 8], [0, 0], [0, 0]], holes: [] };
    expect(smoothIslandRing(rect)).toBe(rect);
    const big: AreaFeat = { id: 3, kind: "green", ring: poly([0, 0], 60, 12), holes: [] };
    expect(smoothIslandRing(big)).toBe(big);
    const water: AreaFeat = { id: 4, kind: "water", ring: poly([0, 0], 9, 9), holes: [] };
    expect(smoothIslandRing(water)).toBe(water);
  });

  it("circleRing is closed with a fixed segment count", () => {
    const ring = circleRing([0, 0], 5);
    expect(ring).toHaveLength(ROUNDABOUT_SEGMENTS + 1);
    expect(ring[0]).toEqual(ring.at(-1));
  });
});

describe("roundabout island in the plan road fill", async () => {
  const { bufferCentreline } = await import("./roadFill");
  const { fillRoadMedianGaps } = await import("./roadMedianFill");
  it("the median fill paints an unmapped island as road, and keeps the added island green", () => {
    const road = bufferCentreline(circleRing([0, 0], 10), 5.5);
    expect(road[0]!.length).toBe(2); // the ring keeps its island hole
    const streets = [{ line: circleRing([0, 0], 10), width: 5.5 }];
    const keep = { water: [], paths: [], buildings: [] };
    const without = fillRoadMedianGaps(road, { ...keep, green: [] }, undefined, streets);
    expect(without.every((polygon) => polygon.length === 1)).toBe(true);
    const island = withRoundaboutIslands([], [{ key: "w1", center: [0, 0], radius: 10, width: 5.5 }])[0]!;
    const withIsland = fillRoadMedianGaps(road, { ...keep, green: [[island.ring]] }, undefined, streets);
    expect(withIsland.some((polygon) => polygon.length === 2)).toBe(true);
  });
});

describe("roundabout islands at the site frame", () => {
  it("leaves out an island the frame would cut, and keeps the mapped one", () => {
    const mapped: AreaFeat = { id: 9, kind: "green", ring: [[490, -5], [499, -5], [499, 5], [490, 5]], holes: [] };
    const out = withRoundaboutIslands([mapped], [{ key: "w1", center: [496, 0], radius: 10, width: 5.5 }], { sideM: 1000, shape: "square" });
    expect(out).toEqual([mapped]);
  });
});
