import { describe, expect, it } from "vitest";
import {
  arrowBoundsReport,
  arrowHeadTriangle,
  buildWindArrowBuffer,
  updateWindArrowDashOffset,
  WIND_ARROW_COUNT,
  WIND_ARROW_LOOP_S,
  windFlowArrowPolylines,
} from "./windArrowGeometry";
import { downwindFromSector } from "./windRose";

describe("windArrowGeometry", () => {
  it("builds 5–7 large curves inside the frame above terrain", () => {
    const buffer = buildWindArrowBuffer(1000, 4, null);
    expect(buffer.curves.length).toBeGreaterThanOrEqual(5);
    expect(buffer.curves.length).toBeLessThanOrEqual(7);
    expect(buffer.curves.length).toBe(WIND_ARROW_COUNT);
    const report = arrowBoundsReport(buffer);
    expect(report.insideFrame).toBe(true);
    expect(report.aboveTerrain).toBe(true);
    for (const curve of buffer.curves) {
      expect(curve.pathLenM).toBeGreaterThanOrEqual(298);
      expect(curve.pathLenM).toBeLessThanOrEqual(460);
    }
  });

  it("keeps curves separated and oriented downwind", () => {
    const buffer = buildWindArrowBuffer(1000, 2, null);
    const wind = downwindFromSector(2);
    for (let i = 0; i < buffer.curves.length; i++) {
      for (let j = i + 1; j < buffer.curves.length; j++) {
        let min = Infinity;
        const a = buffer.curves[i]!.positions;
        const b = buffer.curves[j]!.positions;
        for (let k = 0; k < a.length; k += 9) {
          for (let m = 0; m < b.length; m += 9) {
            min = Math.min(
              min,
              Math.hypot(a[k]! - b[m]!, a[k + 1]! - b[m + 1]!, a[k + 2]! - b[m + 2]!),
            );
          }
        }
        expect(min).toBeGreaterThan(50);
      }
    }
    const curve = buffer.curves[0]!;
    const tailX = curve.positions[0]!;
    const tailZ = curve.positions[2]!;
    const headX = curve.positions[(curve.pointCount - 1) * 3]!;
    const headZ = curve.positions[(curve.pointCount - 1) * 3 + 2]!;
    const dx = headX - tailX;
    const dz = headZ - tailZ;
    const north = -dz;
    const east = dx;
    const dot = east * wind.east + north * wind.north;
    expect(dot).toBeGreaterThan(0);
  });

  it("animates dash offset over one loop period", () => {
    const material = { dashOffset: 0 };
    updateWindArrowDashOffset(material, 0, 0, 400);
    const a = material.dashOffset;
    updateWindArrowDashOffset(material, WIND_ARROW_LOOP_S * 0.5, 0, 400);
    expect(material.dashOffset).not.toBe(a);
    updateWindArrowDashOffset(material, WIND_ARROW_LOOP_S, 0, 400);
    expect(material.dashOffset).toBeCloseTo(a, 4);
  });

  it("exports static polylines with filled head triangles", () => {
    const lines = windFlowArrowPolylines(800, 2);
    expect(lines.length).toBe(WIND_ARROW_COUNT);
    for (const line of lines) {
      expect(line.path.length).toBeGreaterThan(10);
      expect(line.head.length).toBe(3);
      const tri = arrowHeadTriangle(buildWindArrowBuffer(800, 2, null).curves[0]!);
      expect(tri.positions.length).toBe(9);
    }
  });
});
