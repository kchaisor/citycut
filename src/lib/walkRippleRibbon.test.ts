import { describe, expect, it } from "vitest";
import { buildWalkNetwork, computeRippleTimesNetwork } from "./walkRippleNetwork";
import {
  assertRibbonTriangleEdges,
  buildNetworkRibbonBuffers,
  clampRibbonHalfWidthM,
  WALK_RIPPLE_RIBBON_HALF_DEFAULT_M,
  WALK_RIPPLE_RIBBON_HALF_MAX_M,
  WALK_RIPPLE_RIBBON_HALF_MIN_M,
} from "./walkRippleRibbon";
import type { RoadFeat } from "../types";

const flatHeight = () => 0;

describe("walkRippleRibbon", () => {
  it("clamps half width to 4–6 m", () => {
    expect(clampRibbonHalfWidthM(2)).toBe(WALK_RIPPLE_RIBBON_HALF_MIN_M);
    expect(clampRibbonHalfWidthM(5)).toBe(5);
    expect(clampRibbonHalfWidthM(21)).toBe(WALK_RIPPLE_RIBBON_HALF_MAX_M);
  });

  it("builds isolated quads with no triangle edge longer than edge length + 2×halfWidth", () => {
    const roads: RoadFeat[] = [
      { id: 1, line: [[-80, 0], [0, 0], [120, 0]], width: 8, kind: "road", grade: "local" },
      { id: 2, line: [[0, -60], [0, 0], [0, 90]], width: 8, kind: "road", grade: "local" },
      { id: 3, line: [[40, 40], [90, 10]], width: 6, kind: "road", grade: "arterial" },
    ];
    const network = buildWalkNetwork(roads)!;
    const times = computeRippleTimesNetwork(network, 0, 0);
    const buffers = buildNetworkRibbonBuffers(
      network,
      times.edgeVertexTimes,
      WALK_RIPPLE_RIBBON_HALF_DEFAULT_M,
      flatHeight,
      1.2,
    );
    expect(buffers.positions.length).toBe(network.edges.length * 18);
    expect(buffers.halfWidthM).toBe(WALK_RIPPLE_RIBBON_HALF_DEFAULT_M);
    expect(() => assertRibbonTriangleEdges(buffers.positions, buffers.edgeLengthsM, buffers.halfWidthM)).not.toThrow();
  });

  it("offsets corners perpendicular to the edge in east and north", () => {
    const roads: RoadFeat[] = [{ id: 1, line: [[0, 0], [100, 0]], width: 8, kind: "road", grade: "local" }];
    const network = buildWalkNetwork(roads)!;
    const times = computeRippleTimesNetwork(network, 50, 0);
    const hw = 5;
    const buffers = buildNetworkRibbonBuffers(network, times.edgeVertexTimes, hw, flatHeight, 1.2);
    const p = buffers.positions;
    const widthAtA = Math.hypot(p[0]! - p[15]!, p[2]! - p[17]!);
    expect(widthAtA).toBeCloseTo(hw * 2, 3);
  });

  it("keeps ribbon triangles local on sloped terrain", () => {
    const roads: RoadFeat[] = [{ id: 1, line: [[0, 0], [80, 0]], width: 8, kind: "road", grade: "local" }];
    const network = buildWalkNetwork(roads)!;
    const times = computeRippleTimesNetwork(network, 0, 0);
    const slope = (e: number) => e * 0.12;
    const buffers = buildNetworkRibbonBuffers(network, times.edgeVertexTimes, 5, slope, 1.2);
    expect(() => assertRibbonTriangleEdges(buffers.positions, buffers.edgeLengthsM, buffers.halfWidthM)).not.toThrow();
  });
});
