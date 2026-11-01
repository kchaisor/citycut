import { describe, expect, it } from "vitest";
import { assignAmenityArrivals, countAmenitiesReached } from "./walkRippleAmenityReach";
import { computeRippleTimes, WALK_RIPPLE_SPEED_MPM } from "./walkRippleNetwork";
import { defaultAmenityTypeFilters, type WalkRippleAmenity } from "./walkRippleAmenityTypes";
import type { RoadFeat } from "../types";

function amenity(id: number, east: number, north: number): WalkRippleAmenity {
  return { id, type: "cafe", name: "Test café (OSM)", east, north, osmInferredName: true };
}

describe("assignAmenityArrivals", () => {
  it("maps walk time from the ripple network to amenity points", () => {
    const roads: RoadFeat[] = [
      { id: 1, line: [[-100, 0], [0, 0], [100, 0]], width: 8, kind: "road", grade: "local" },
    ];
    const times = computeRippleTimes({ roads }, 0, 0);
    const arrivals = assignAmenityArrivals([amenity(1, 80, 0)], times, { roads });
    expect(arrivals[0]!.arrivalMin).toBeCloseTo(80 / WALK_RIPPLE_SPEED_MPM, 1);
  });

  it("uses straight-line minutes when no walk network exists", () => {
    const roads: RoadFeat[] = [];
    const times = computeRippleTimes({ roads }, 0, 0);
    const arrivals = assignAmenityArrivals([amenity(2, 40, 30)], times, { roads });
    expect(arrivals[0]!.arrivalMin).toBeCloseTo(Math.hypot(40, 30) / WALK_RIPPLE_SPEED_MPM, 1);
  });
});

describe("countAmenitiesReached", () => {
  it("counts reached amenities per type at the scrubber minute", () => {
    const filters = defaultAmenityTypeFilters();
    filters.transport = false;
    const arrivals = [
      { id: 1, type: "cafe" as const, name: "A", east: 0, north: 0, osmInferredName: false, arrivalMin: 1 },
      { id: 2, type: "school" as const, name: "B", east: 0, north: 0, osmInferredName: false, arrivalMin: 2 },
      { id: 3, type: "transport" as const, name: "C", east: 0, north: 0, osmInferredName: false, arrivalMin: 0.5 },
    ];
    const counts = countAmenitiesReached(arrivals, 1.5, filters);
    expect(counts.cafe).toBe(1);
    expect(counts.school).toBe(0);
    expect(counts.transport).toBe(0);
  });
});
