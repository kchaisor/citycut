import { describe, expect, it } from "vitest";
import { buildHeliodonDiagramOverlay, heliodonDiagramRadiusM, heliodonLabelFontMetres } from "./heliodonDiagram";

describe("heliodon diagram overlay", () => {
  it("sizes the ring to 0.45 of the frame side at the default slider value", () => {
    expect(heliodonDiagramRadiusM(1000)).toBe(450);
  });

  it("scales the 2D dial proportionally with the sun-path size slider", () => {
    expect(heliodonDiagramRadiusM(1000, 1.75)).toBeCloseTo(450, 6);
    expect(heliodonDiagramRadiusM(1000, 1)).toBeCloseTo(450 * (1 / 1.75), 6);
    expect(heliodonDiagramRadiusM(1000, 3.5)).toBeCloseTo(450 * (3.5 / 1.75), 6);
  });

  it("keeps a lower floor so tiny slider values stay legible", () => {
    expect(heliodonDiagramRadiusM(1000, 0.2)).toBe(120);
  });

  it("keeps degree labels inside the frame bounds", () => {
    const overlay = buildHeliodonDiagramOverlay({
      lat: -37.8136,
      lon: 144.9631,
      year: 2026,
      month: 6,
      day: 21,
      hour: 12,
      minute: 0,
      sideM: 1000,
    });
    const limit = overlay.radiusM * 1.2;
    for (const label of overlay.degreeLabels) {
      expect(Math.hypot(label.east, label.north)).toBeLessThan(limit);
    }
    expect(overlay.arcs.length).toBe(3);
  });

  it("maps label font size to paper points at plan scale", () => {
    expect(heliodonLabelFontMetres(1000, 6.5)).toBeCloseTo(2.29, 2);
    expect(heliodonLabelFontMetres(2500, 6.5)).toBeCloseTo(5.73, 1);
  });
});
