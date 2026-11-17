import { describe, expect, it } from "vitest";
import { placeWindArrow, rectsOverlap, WIND_ARROW_CLEAR_PX } from "./windPlanArrow";

const view = { x0: 14, y0: 14, x1: 1426, y1: 886 };

describe("placeWindArrow", () => {
  it("sits at the upwind edge for a north-north-east wind", () => {
    const layout = placeWindArrow({ view, downwind: { x: -0.38, y: 0.92 }, chipW: 70, chipH: 20, obstacles: [] });
    expect(layout.clear).toBe(true);
    expect(layout.bounds.y0).toBeCloseTo(view.y0, 0);
    expect(layout.tail.x).toBeGreaterThan((view.x0 + view.x1) / 2);
    expect(layout.head.y).toBeGreaterThan(layout.tail.y);
  });

  it("keeps at least 24px clear of panels", () => {
    const panel = { x0: 600, y0: 0, x1: 1440, y1: 140 };
    const layout = placeWindArrow({ view, downwind: { x: -0.38, y: 0.92 }, chipW: 70, chipH: 20, obstacles: [panel] });
    expect(layout.clear).toBe(true);
    expect(rectsOverlap(layout.bounds, panel, WIND_ARROW_CLEAR_PX)).toBe(false);
  });

  it("reports when nowhere is clear", () => {
    const layout = placeWindArrow({ view, downwind: { x: 1, y: 0 }, chipW: 70, chipH: 20, obstacles: [{ x0: 0, y0: 0, x1: 1440, y1: 900 }] });
    expect(layout.clear).toBe(false);
  });
});
