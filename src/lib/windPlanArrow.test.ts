import { describe, expect, it } from "vitest";
import {
  placeWindArrow,
  rectsOverlap,
  upwindMapEdge,
  WIND_ARROW_CLEAR_PX,
  WIND_ARROW_EDGE_GAP_PX,
  WIND_ARROW_STEP_PX,
  type ScreenRect,
  type ScreenVec,
} from "./windPlanArrow";

const view = { x0: 14, y0: 14, x1: 1426, y1: 886 };
const mapRect = { x0: 320, y0: 140, x1: 1060, y1: 880 };
const corners = (r: ScreenRect, dx = 0, dy = 0): ScreenVec[] => [
  { x: r.x0 + dx, y: r.y1 + dy },
  { x: r.x1 + dx, y: r.y1 + dy },
  { x: r.x1 + dx, y: r.y0 + dy },
  { x: r.x0 + dx, y: r.y0 + dy },
];
const fromNorth = { x: 0, y: 1 };
const fromNorthEast = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
const chip = { chipW: 70, chipH: 20 };
const midX = (mapRect.x0 + mapRect.x1) / 2;

describe("upwindMapEdge", () => {
  it("anchors a north wind at the middle of the map's top edge", () => {
    const edge = upwindMapEdge(corners(mapRect), { x: 0, y: -1 })!;
    expect(edge.points).toHaveLength(2);
    expect(edge.points.every((p) => p.y === mapRect.y0)).toBe(true);
    expect(edge.anchorAt).toBeCloseTo((mapRect.x1 - mapRect.x0) / 2, 6);
  });

  it("lets a north-east wind slide along the top and right edges from the corner", () => {
    const square = { x0: 300, y0: 100, x1: 1100, y1: 900 };
    const edge = upwindMapEdge(corners(square), { x: Math.SQRT1_2, y: -Math.SQRT1_2 })!;
    expect(edge.points).toHaveLength(3);
    const total = edge.lengths[edge.lengths.length - 1]!;
    expect(edge.anchorAt).toBeCloseTo(total / 2, 6);
  });
});

describe("placeWindArrow", () => {
  it("sits just outside the middle of the top map edge for a north wind, pointing in", () => {
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels: [] });
    expect(layout.clear).toBe(true);
    expect(layout.tail.x).toBeCloseTo(midX, 6);
    expect(layout.head.y).toBeGreaterThan(layout.tail.y);
    expect(layout.head.y).toBeCloseTo(mapRect.y0 - WIND_ARROW_EDGE_GAP_PX, 6);
    expect(layout.bounds.y1).toBeLessThanOrEqual(mapRect.y0);
  });

  it("sits at the top-right map corner for a north-east wind", () => {
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorthEast, ...chip, panels: [] });
    expect(layout.clear).toBe(true);
    expect(Math.hypot(layout.head.x - mapRect.x1, layout.head.y - mapRect.y0)).toBeLessThan(40);
    expect(layout.head.x).toBeLessThan(layout.tail.x);
    expect(layout.head.y).toBeGreaterThan(layout.tail.y);
  });

  it("follows the map when the camera pans", () => {
    const before = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels: [] });
    const after = placeWindArrow({ view, map: corners(mapRect, -60, 40), downwind: fromNorth, ...chip, panels: [] });
    expect(after.tail.x - before.tail.x).toBeCloseTo(-60, 6);
    expect(after.tail.y - before.tail.y).toBeCloseTo(40, 6);
  });

  it("slides along the top edge only as far as needed to clear a panel by 24px", () => {
    const panel = { x0: midX - 60, y0: 14, x1: midX + 60, y1: 120 };
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels: [panel] });
    expect(layout.clear).toBe(true);
    expect(rectsOverlap(layout.bounds, panel, WIND_ARROW_CLEAR_PX)).toBe(false);
    expect(layout.bounds.y1).toBeLessThanOrEqual(mapRect.y0);
    const needed = 60 + WIND_ARROW_CLEAR_PX + chip.chipW / 2;
    expect(Math.abs(layout.tail.x - midX)).toBeGreaterThanOrEqual(needed);
    expect(Math.abs(layout.tail.x - midX)).toBeLessThan(needed + WIND_ARROW_STEP_PX);
  });

  it("steps just inside the map when a top bar covers the whole upwind edge", () => {
    const bar = { x0: 14, y0: 14, x1: 1426, y1: 160 };
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels: [bar] });
    expect(layout.clear).toBe(true);
    expect(layout.bounds.y0).toBeGreaterThanOrEqual(bar.y1 + WIND_ARROW_CLEAR_PX);
    expect(layout.bounds.y0).toBeLessThan(bar.y1 + WIND_ARROW_CLEAR_PX + WIND_ARROW_STEP_PX);
    expect(layout.tail.x).toBeCloseTo(midX, 6);
  });

  it("keeps clear of buildings once it has to step inside the map", () => {
    const bar = { x0: 14, y0: 14, x1: 1426, y1: 160 };
    const house = { x0: midX - 20, y0: 180, x1: midX + 20, y1: 300 };
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels: [bar], buildings: [house] });
    expect(layout.clear).toBe(true);
    expect(rectsOverlap(layout.bounds, house, WIND_ARROW_CLEAR_PX)).toBe(false);
    expect(rectsOverlap(layout.bounds, bar, WIND_ARROW_CLEAR_PX)).toBe(false);
  });

  it("reports when nowhere is clear", () => {
    const layout = placeWindArrow({
      view,
      map: corners(mapRect),
      downwind: { x: 1, y: 0 },
      ...chip,
      panels: [{ x0: 0, y0: 0, x1: 1440, y1: 900 }],
    });
    expect(layout.clear).toBe(false);
  });
});
