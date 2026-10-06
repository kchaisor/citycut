import { describe, expect, it } from "vitest";
import {
  arrowBoundsReport,
  buildWindArrowBuffer,
  updateWindArrowDashOffset,
  WIND_ARROW_COUNT,
  windFlowArrowPolylines,
} from "./windArrowGeometry";

describe("windArrowGeometry", () => {
  it("builds 5–7 large curves inside the frame above terrain", () => {
    const buffer = buildWindArrowBuffer(1000, 4, null);
    expect(buffer.curves.length).toBeGreaterThanOrEqual(5);
    expect(buffer.curves.length).toBeLessThanOrEqual(7);
    expect(buffer.curves.length).toBe(WIND_ARROW_COUNT);
    const report = arrowBoundsReport(buffer);
    expect(report.insideFrame).toBe(true);
    expect(report.aboveTerrain).toBe(true);
  });

  it("animates dash offset in place", () => {
    const material = { dashOffset: 0 };
    updateWindArrowDashOffset(material, 0, 0);
    const a = material.dashOffset;
    updateWindArrowDashOffset(material, 2.25, 0);
    expect(material.dashOffset).not.toBe(a);
  });

  it("exports static polylines with heads", () => {
    const lines = windFlowArrowPolylines(800, 2);
    expect(lines.length).toBe(WIND_ARROW_COUNT);
    for (const line of lines) {
      expect(line.path.length).toBeGreaterThan(10);
      expect(line.head.length).toBe(3);
    }
  });
});
