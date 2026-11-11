import { describe, expect, it } from "vitest";
import { nearestPointOnSegment, nearestSnapEdge, poseFromEdgePoint, snapPoseToPreset, collectSnapEdges } from "./snap";
import { northClockwiseDegFromPose, poseFromNorthClockwiseDeg } from "./angleNorth";
import type { CityModel } from "../../types";

const model = (): CityModel =>
  ({
    sideM: 200,
    center: { lat: -37.8, lon: 145.1 },
    buildings: [],
    roads: [
      {
        line: [
          [-40, 0],
          [40, 0],
        ],
        width: 8,
        kind: "road",
        grade: 0,
      },
    ],
    trees: [],
    tramLines: [],
    siteBoundaryLines: [
      [
        [-50, -50],
        [50, -50],
        [50, 50],
        [-50, 50],
        [-50, -50],
      ],
    ],
  }) as unknown as CityModel;

describe("section knife snap", () => {
  it("finds nearest point on a segment", () => {
    const hit = nearestPointOnSegment(0, 0, 10, 0, 4, 3);
    expect(hit.east).toBeCloseTo(4, 3);
    expect(hit.north).toBeCloseTo(0, 3);
    expect(hit.distance).toBeCloseTo(3, 3);
  });

  it("snaps pose angle to a road edge", () => {
    const edge = { kind: "road" as const, aEast: -40, aNorth: 0, bEast: 40, bNorth: 0 };
    const pose = poseFromEdgePoint(edge, 10, 0);
    expect(pose.offsetM).toBeCloseTo(0, 2);
    expect(northClockwiseDegFromPose(pose)).toBeCloseTo(90, 0);
  });

  it("picks the nearest snap edge to a point", () => {
    const edges = collectSnapEdges(model());
    const hit = nearestSnapEdge(edges, 5, 6);
    expect(hit?.edge.kind).toBe("road");
    expect(hit?.distance).toBeLessThan(7);
  });

  it("syncs north-clockwise degrees with pose", () => {
    const pose = poseFromNorthClockwiseDeg(90, 12);
    const back = northClockwiseDegFromPose(pose);
    expect(back).toBeCloseTo(90, 0);
    expect(pose.offsetM).toBe(12);
  });

  it("applies angle presets while keeping offset", () => {
    const snapped = snapPoseToPreset({ angleRad: 0.2, offsetM: 4 }, 45);
    expect(northClockwiseDegFromPose(snapped)).toBeCloseTo(45, 0);
    expect(snapped.offsetM).toBe(4);
  });
});
