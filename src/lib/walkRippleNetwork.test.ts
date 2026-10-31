import { describe, expect, it } from "vitest";
import {
  assignBuildingArrivals,
  buildWalkNetwork,
  computeRippleTimes,
  computeRippleTimesNetwork,
  WALK_RIPPLE_SPEED_MPM,
} from "./walkRippleNetwork";
import type { BuildingFeat, CityModel, RoadFeat } from "../types";

function crossRoadsModel(): Pick<CityModel, "roads" | "buildings"> {
  const roads: RoadFeat[] = [
    { id: 1, line: [[-100, 0], [0, 0], [100, 0]], width: 8, kind: "road", grade: "local" },
    { id: 2, line: [[0, -100], [0, 0], [0, 100]], width: 8, kind: "road", grade: "local" },
  ];
  const buildings: BuildingFeat[] = [
    {
      id: 10,
      ring: [
        [90, -5],
        [95, -5],
        [95, 5],
        [90, 5],
        [90, -5],
      ],
      holes: [],
      height: 12,
      use: "residential",
      source: "none",
    },
  ];
  return { roads, buildings };
}

describe("buildWalkNetwork", () => {
  it("includes local roads and footpaths, not rail or service", () => {
    const network = buildWalkNetwork([
      { id: 1, line: [[0, 0], [10, 0]], width: 4, kind: "road", grade: "path" },
      { id: 2, line: [[0, 0], [0, 10]], width: 8, kind: "rail" },
      { id: 3, line: [[0, 0], [5, 5]], width: 3, kind: "road", grade: "local", service: "driveway" },
    ]);
    expect(network?.edges.length).toBe(1);
  });
});

describe("computeRippleTimesNetwork", () => {
  it("spreads lower travel time along connected streets from the origin", () => {
    const network = buildWalkNetwork(crossRoadsModel().roads)!;
    const times = computeRippleTimesNetwork(network, 0, 0);
    expect(times.mode).toBe("network");
    const centreNode = network.nodes.findIndex(([x, y]) => Math.abs(x) < 1 && Math.abs(y) < 1);
    expect(times.nodeTimesMin[centreNode]!).toBeLessThan(0.01);
    const eastNode = network.nodes.findIndex(([x]) => x > 50);
    expect(times.nodeTimesMin[eastNode]!).toBeCloseTo(100 / WALK_RIPPLE_SPEED_MPM, 1);
  });
});

describe("assignBuildingArrivals", () => {
  it("scores buildings farther along the network later than nearby ones", () => {
    const model = crossRoadsModel();
    const times = computeRippleTimes(model, 0, 0);
    const arrivals = assignBuildingArrivals(model, times);
    expect(arrivals.get(10)).toBeGreaterThan(0.8);
  });

  it("uses straight-line minutes when no walkable network exists", () => {
    const model = {
      roads: [] as RoadFeat[],
      buildings: crossRoadsModel().buildings,
    };
    const times = computeRippleTimes(model, 0, 0);
    expect(times.mode).toBe("straight");
    const arrivals = assignBuildingArrivals(model, times);
    expect(arrivals.get(10)).toBeCloseTo((Math.hypot(92.5, 0) / WALK_RIPPLE_SPEED_MPM), 1);
  });
});
