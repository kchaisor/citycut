import { describe, expect, it } from "vitest";
import {
  CONTOUR_COLOR,
  CONTOUR_DASH_MM,
  CONTOUR_GAP_MM,
  LINE_MM,
  PX_PER_MM,
  screenDashPx,
  screenPx,
} from "./lineweights";

describe("lineweights", () => {
  it("keeps each pen inside the drawing standard", () => {
    expect(LINE_MM).toEqual({
      buildingCut: 0,
      propertyRoad: 0.22,
      secondary: 0.15,
      contour: 0.1,
      frame: 0.35,
      annotation: 0.13,
    });
    expect(LINE_MM.buildingCut).toBe(0);
    expect(LINE_MM.propertyRoad).toBeGreaterThanOrEqual(0.18);
    expect(LINE_MM.propertyRoad).toBeLessThanOrEqual(0.25);
    expect(LINE_MM.secondary).toBeGreaterThanOrEqual(0.13);
    expect(LINE_MM.secondary).toBeLessThanOrEqual(0.18);
    expect(LINE_MM.contour).toBeGreaterThanOrEqual(0.09);
    expect(LINE_MM.contour).toBeLessThanOrEqual(0.13);
    expect(LINE_MM.frame).toBe(0.35);
    expect(LINE_MM.annotation).toBe(0.13);
  });

  it("dashes contours in hidden-line style", () => {
    expect(CONTOUR_COLOR).toBe("#B0B0B0");
    expect(CONTOUR_DASH_MM).toBe(1.5);
    expect(CONTOUR_GAP_MM).toBe(0.75);
    expect(screenDashPx(CONTOUR_DASH_MM)).toBeCloseTo(screenDashPx(CONTOUR_GAP_MM) * 2, 5);
  });

  it("maps a millimetre to about 3.78 px and keeps the hierarchy visible", () => {
    expect(PX_PER_MM).toBeCloseTo(3.78, 2);
    expect(screenPx(LINE_MM.contour)).toBeGreaterThanOrEqual(0.55);
    expect(screenPx(0)).toBe(0);
    expect(screenPx(LINE_MM.buildingCut)).toBe(0);
    expect(screenPx(0.4)).toBeLessThanOrEqual(2.4);
    expect(screenPx(0.4)).toBeGreaterThan(screenPx(LINE_MM.frame));
    expect(screenPx(LINE_MM.frame)).toBeGreaterThan(screenPx(LINE_MM.propertyRoad));
    expect(screenPx(LINE_MM.propertyRoad)).toBeGreaterThan(screenPx(LINE_MM.secondary));
    expect(screenPx(LINE_MM.secondary)).toBeGreaterThan(screenPx(LINE_MM.annotation));
    expect(screenPx(LINE_MM.annotation)).toBeGreaterThan(screenPx(LINE_MM.contour));
  });
});
