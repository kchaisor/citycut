import { beforeEach, describe, expect, it } from "vitest";
import type { Pt } from "../types";
import {
  CENTRELINE_SHARP_TURN_DEG,
  clearCentrelineCacheForTests,
  FOOTPATH_CENTRELINE_DENSIFY,
  maxInteriorTurnDeg,
  maxInteriorTurnDegInViewBox,
  maxLateralShift,
  pinnedVertexIndices,
  smoothCentreline,
  smoothCentrelineStrips,
} from "./centrelineSmooth";
import { CLIPPER_ARC_CHORD_M, CLIPPER_FOOTPATH_FILLET_ARC_TOLERANCE_M, arcSegmentCount } from "./polygonOffset";
import { clearFootpathUnionCacheForTests, unionFootpathStrips } from "./roadFill";

describe("centrelineSmooth", () => {
  beforeEach(() => {
    clearCentrelineCacheForTests();
  });

  it("pins endpoints and junctions but not ordinary corners", () => {
    const line: Pt[] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [40, 20],
    ];
    const pins = pinnedVertexIndices(line);
    expect(pins).toContain(0);
    expect(pins).toContain(3);
    expect(pins).toContain(2);
  });

  it("keeps junction and endpoint coordinates fixed after smoothing", () => {
    const junction: Pt = [20, 0];
    const strips = [
      { line: [[0, 0], junction, [40, 0]] as Pt[], width: 2 },
      { line: [junction, [20, -30]] as Pt[], width: 2 },
    ];
    const smoothed = smoothCentrelineStrips(strips);
    expect(smoothed[0]!.line[0]).toEqual([0, 0]);
    expect(smoothed[0]!.line[smoothed[0]!.line.length - 1]).toEqual([40, 0]);
    const onJunction = smoothed[0]!.line.find((p) => Math.hypot(p[0] - 20, p[1]) < 0.05);
    expect(onJunction).toEqual(junction);
    const down = smoothed[1]!.line.find((p) => Math.hypot(p[0] - 20, p[1]) < 0.05);
    expect(down).toEqual(junction);
  });

  it("limits lateral shift on a gentle bend", () => {
    const line: Pt[] = [
      [0, 0],
      [40, 0],
      [40, 40],
    ];
    const smoothed = smoothCentreline(line, { profile: FOOTPATH_CENTRELINE_DENSIFY });
    expect(maxLateralShift(line, smoothed)).toBeLessThanOrEqual(FOOTPATH_CENTRELINE_DENSIFY.maxLateralShiftM);
    expect(maxInteriorTurnDeg(smoothed, [], CENTRELINE_SHARP_TURN_DEG)).toBeLessThanOrEqual(10);
  });

  it("uses a tight clipper arc tolerance for footpath fillets", () => {
    expect(CLIPPER_FOOTPATH_FILLET_ARC_TOLERANCE_M).toBe(CLIPPER_ARC_CHORD_M);
    expect(arcSegmentCount(2, Math.PI / 2)).toBeGreaterThanOrEqual(15);
  });

  it("rounds an interior corner with a tangent arc", () => {
    const line: Pt[] = [
      [0, 0],
      [30, 0],
      [45, 15],
    ];
    const smoothed = smoothCentreline(line, { profile: FOOTPATH_CENTRELINE_DENSIFY });
    expect(smoothed.length).toBeGreaterThan(3);
    expect(maxInteriorTurnDegInViewBox(smoothed, "20 -5 30 20", [], CENTRELINE_SHARP_TURN_DEG, 3)).toBeLessThanOrEqual(10);
  });

  it("adds enough vertices on a filleted footpath crossing", () => {
    clearFootpathUnionCacheForTests();
    const len = 40;
    const strips = [
      { line: [[-len / 2, 0], [len / 2, 0]] as Pt[], width: 1.2 },
      { line: [[0, -len / 2], [0, len / 2]] as Pt[], width: 1.2 },
    ];
    const filleted = unionFootpathStrips(strips, 200, "square", 2, 1.2);
    const outer = filleted.polygons[0]?.[0]?.slice(0, -1) ?? [];
    const nearCross = outer.filter((p) => Math.hypot(p[0], p[1]) > 0.35 && Math.hypot(p[0], p[1]) < 2.5);
    expect(nearCross.length).toBeGreaterThanOrEqual(8);
  });
});
