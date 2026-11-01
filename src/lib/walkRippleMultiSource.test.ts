import { describe, expect, it } from "vitest";
import { buildWalkNetwork, computeRippleTimesNetworkOrigins } from "./walkRippleNetwork";
import {
  computeMultiSourceRipple,
  computeSeamSegments,
  equalTimeSplitM,
  WALK_RIPPLE_MAX_ORIGINS,
} from "./walkRippleMultiSource";
import type { RoadFeat } from "../types";

function crossRoads(): RoadFeat[] {
  return [
    { id: 1, line: [[-100, 0], [0, 0], [100, 0]], width: 8, kind: "road", grade: "local" },
    { id: 2, line: [[0, -100], [0, 0], [0, 100]], width: 8, kind: "road", grade: "local" },
  ];
}

describe("computeMultiSourceRipple", () => {
  it("assigns each half of a cross to the nearer rival origin", () => {
    const network = buildWalkNetwork(crossRoads())!;
    const result = computeMultiSourceRipple(network, [
      [-80, 0],
      [80, 0],
    ]);
    expect(result.origins.length).toBe(2);
    const westNode = network.nodes.findIndex(([x]) => x < -50);
    const eastNode = network.nodes.findIndex(([x]) => x > 50);
    expect(result.nodeOriginId[westNode]).toBe(0);
    expect(result.nodeOriginId[eastNode]).toBe(1);
    expect(Number.isFinite(result.nodeTimesMin[westNode]!)).toBe(true);
    expect(Number.isFinite(result.nodeTimesMin[eastNode]!)).toBe(true);
  });

  it("caps at three origins", () => {
    const network = buildWalkNetwork(crossRoads())!;
    const result = computeMultiSourceRipple(network, [
      [-80, 0],
      [0, 80],
      [80, 0],
      [0, -80],
    ]);
    expect(result.origins.length).toBe(WALK_RIPPLE_MAX_ORIGINS);
  });
});

describe("equalTimeSplitM and seams", () => {
  it("splits an edge at the midpoint when rival times are symmetric", () => {
    const network = buildWalkNetworksSymmetricEdge();
    const edge = network.edges[0]!;
    const s = equalTimeSplitM(edge, 1, 1);
    expect(s).toBeCloseTo(edge.lengthM / 2, 3);
  });

  it("emits a perpendicular seam segment on rival boundaries", () => {
    const network = buildWalkNetwork(crossRoads())!;
    const times = computeRippleTimesNetworkOrigins(network, [
      [-80, 0],
      [80, 0],
    ]);
    const seams = computeSeamSegments(network, times.nodeTimesMin, times.nodeOriginId);
    expect(seams.length).toBeGreaterThanOrEqual(4);
    const span = Math.hypot(seams[2]! - seams[0]!, seams[3]! - seams[1]!);
    expect(span).toBeGreaterThan(3);
    expect(seams.length % 4).toBe(0);
  });
});

function buildWalkNetworksSymmetricEdge() {
  const roads: RoadFeat[] = [{ id: 1, line: [[0, 0], [100, 0]], width: 8, kind: "road", grade: "local" }];
  return buildWalkNetwork(roads)!;
}
