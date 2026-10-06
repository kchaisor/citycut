import { describe, expect, it } from "vitest";
import type { InterleavedBufferAttribute } from "three";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import {
  buildWindStreakBuffer,
  streakBoundsReport,
  updateWindStreakPositions,
  windStreakSpeedMs,
  writeLineSegmentPositions,
  WIND_STREAK_COUNT,
} from "./windStreakGeometry";

describe("windStreakGeometry", () => {
  it("keeps streak centres inside the frame and above terrain after drift", () => {
    const heights = new Float32Array(50 * 50).fill(35);
    const buffer = buildWindStreakBuffer(400, 0, {
      min: 30,
      max: 45,
      zoom: 14,
      cols: 50,
      rows: 50,
      heights,
      spacingM: 8,
      metresPerPixel: 8,
      source: "Mapterhorn",
    });
    updateWindStreakPositions(buffer, 0, 120, 4);
    const report = streakBoundsReport(buffer);
    expect(report.insideFrame).toBe(true);
    expect(report.aboveTerrain).toBe(true);
    expect(Math.abs(report.maxEast)).toBeLessThanOrEqual(200);
    expect(Math.abs(report.minEast)).toBeLessThanOrEqual(200);
    expect(buffer.positions.length).toBe(WIND_STREAK_COUNT * 6);
  });

  it("targets a 25–40 s frame crossing scaled by median wind", () => {
    const sideM = 1000;
    const calm = windStreakSpeedMs(sideM, 8);
    const strong = windStreakSpeedMs(sideM, 32);
    expect(sideM / calm).toBeGreaterThanOrEqual(25);
    expect(sideM / calm).toBeLessThanOrEqual(40);
    expect(sideM / strong).toBeGreaterThanOrEqual(25);
    expect(sideM / strong).toBeLessThanOrEqual(40);
    expect(strong).toBeGreaterThan(calm);
  });

  it("updates line geometry buffers in place", () => {
    const buffer = buildWindStreakBuffer(400, 4, null);
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(buffer.positions.slice());
    const startAttr = geometry.attributes.instanceStart as InterleavedBufferAttribute;
    const startBuffer = startAttr.data;
    const versionBefore = startBuffer.version;
    updateWindStreakPositions(buffer, 4, 2, windStreakSpeedMs(400, 20));
    writeLineSegmentPositions(geometry, buffer.positions);
    expect((geometry.attributes.instanceStart as InterleavedBufferAttribute).data).toBe(startBuffer);
    expect((startBuffer.array as Float32Array)[0]).toBe(buffer.positions[0]);
    expect(startBuffer.version).toBe(versionBefore + 1);
  });
});
