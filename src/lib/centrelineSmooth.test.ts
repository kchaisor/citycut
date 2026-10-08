import { beforeEach, describe, expect, it } from "vitest";
import type { Pt } from "../types";
import {
  clearCentrelineCacheForTests,
  junctionPointsFromStrips,
  pinnedVertexIndices,
  smoothCentreline,
  smoothCentrelineStrips,
} from "./centrelineSmooth";
import { CLIPPER_ARC_CHORD_M, CLIPPER_FOOTPATH_FILLET_ARC_TOLERANCE_M, arcSegmentCount } from "./polygonOffset";
import { clearFootpathUnionCacheForTests, unionFootpathStrips } from "./roadFill";

describe("centrelineSmooth stubs", () => {
  beforeEach(() => {
    clearCentrelineCacheForTests();
  });

  it("pins endpoints and junctions on a polyline", () => {
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

  it("passes centrelines through unchanged", () => {
    const line: Pt[] = [
      [0, 0],
      [30, 0],
      [45, 15],
    ];
    expect(smoothCentreline(line)).toEqual(line);
    const strips = [{ line, width: 2 }];
    expect(smoothCentrelineStrips(strips)[0]!.line).toEqual(line);
  });

  it("uses a tight clipper arc tolerance for footpath fillets", () => {
    expect(CLIPPER_FOOTPATH_FILLET_ARC_TOLERANCE_M).toBe(CLIPPER_ARC_CHORD_M);
    expect(CLIPPER_ARC_CHORD_M).toBe(0.01);
    expect(arcSegmentCount(2, Math.PI / 2)).toBeGreaterThanOrEqual(8);
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

  it("finds junction points from strips", () => {
    const junction: Pt = [20, 0];
    const strips = [
      { line: [[0, 0], junction, [40, 0]] as Pt[] },
      { line: [junction, [20, -30]] as Pt[] },
    ];
    const junctions = junctionPointsFromStrips(strips);
    expect(junctions.length).toBeGreaterThan(0);
  });
});
