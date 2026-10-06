import { describe, expect, it } from "vitest";
import {
  buildWindStreakBuffer,
  streakBoundsReport,
  updateWindStreakPositions,
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
});
