import { describe, expect, it } from "vitest";
import {
  arrowBoundsReport,
  arrowHeadTriangle,
  buildWindArrowBuffer,
  updateWindArrowDrift,
  windArrowEdgeOpacity,
  windFlowArrowPolylines,
  windStreakSpeedMs,
  WIND_ARROW_COUNT,
  WIND_ARROW_FADE_FRAC,
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

  it("drifts arrow heads downwind between t and t+1 s", () => {
    const buffer = buildWindArrowBuffer(1000, 4, null);
    const speed = windStreakSpeedMs(1000, 20);
    const wind = downwindFromSector(4);
    updateWindArrowDrift(buffer, 4, 12, speed);
    const before = buffer.curves.map((c) => ({ east: c.headEast, north: c.headNorth }));
    updateWindArrowDrift(buffer, 4, 13, speed);
    const after = buffer.curves.map((c) => ({ east: c.headEast, north: c.headNorth }));
    for (let i = 0; i < before.length; i++) {
      const de = after[i]!.east - before[i]!.east;
      const dn = after[i]!.north - before[i]!.north;
      const along = de * wind.east + dn * wind.north;
      expect(along).toBeGreaterThan(0);
    }
  });

  it("keeps visible drift geometry inside the frame", () => {
    const buffer = buildWindArrowBuffer(1000, 6, null);
    const speed = windStreakSpeedMs(1000, 15);
    const half = buffer.sideM / 2;
    for (const t of [8, 14, 22, 31]) {
      updateWindArrowDrift(buffer, 6, t, speed);
      for (const curve of buffer.curves) {
        if (curve.opacity <= 0.05) continue;
        for (let s = 0; s < curve.pointCount; s++) {
          const east = curve.positions[s * 3]!;
          const north = -curve.positions[s * 3 + 2]!;
          expect(Math.abs(east)).toBeLessThanOrEqual(half + 0.01);
          expect(Math.abs(north)).toBeLessThanOrEqual(half + 0.01);
        }
      }
    }
  });

  it("ramps opacity at upwind and downwind edges", () => {
    const sideM = 1000;
    const pathLen = 350;
    const half = sideM / 2;
    const upwind = -half + sideM * WIND_ARROW_FADE_FRAC * 0.25;
    const mid = 0;
    const downwind = half - sideM * WIND_ARROW_FADE_FRAC * 0.25;
    expect(windArrowEdgeOpacity(upwind, sideM, pathLen)).toBeLessThan(0.45);
    expect(windArrowEdgeOpacity(mid, sideM, pathLen)).toBe(1);
    expect(windArrowEdgeOpacity(downwind, sideM, pathLen)).toBeLessThan(0.45);
  });

  it("exports static polylines unchanged across calls", () => {
    const a = windFlowArrowPolylines(800, 2);
    const b = windFlowArrowPolylines(800, 2);
    expect(a.length).toBe(WIND_ARROW_COUNT);
    expect(b.length).toBe(WIND_ARROW_COUNT);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.path).toEqual(b[i]!.path);
      expect(a[i]!.head).toEqual(b[i]!.head);
    }
    for (const line of a) {
      expect(line.path.length).toBeGreaterThan(10);
      expect(line.head.length).toBe(3);
      const tri = arrowHeadTriangle(buildWindArrowBuffer(800, 2, null).curves[0]!);
      expect(tri.positions.length).toBe(9);
    }
  });
});
