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

  it("moves to the screen margin beyond the upwind edge's end when a top bar covers that edge", () => {
    const bar = { x0: 14, y0: 14, x1: 1426, y1: 160 };
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels: [bar] });
    expect(layout.clear).toBe(true);
    expect(layout.bounds.x1).toBeLessThanOrEqual(mapRect.x0 - WIND_ARROW_EDGE_GAP_PX);
    expect(rectsOverlap(layout.bounds, bar, WIND_ARROW_CLEAR_PX)).toBe(false);
    expect(layout.bounds.y0).toBeLessThan(bar.y1 + WIND_ARROW_CLEAR_PX + WIND_ARROW_STEP_PX);
    expect(mapRect.x0 - layout.bounds.x1).toBeLessThan(WIND_ARROW_EDGE_GAP_PX + WIND_ARROW_STEP_PX);
    expect(layout.head.x).toBeCloseTo(layout.tail.x, 6);
    expect(layout.head.y).toBeGreaterThan(layout.tail.y);
  });

  it("keeps the margin placement clear of HUD islands and of buildings near the map edge", () => {
    const topBar = { x0: 14, y0: 14, x1: 1426, y1: 56 };
    const rail = { x0: 14, y0: 68, x1: 66, y1: 210 };
    const card = { x0: 14, y0: 220, x1: 250, y1: 635 };
    const inspector = { x0: 742, y0: 68, x1: 1010, y1: 110 };
    const map = { x0: 156, y0: 32, x1: 868, y1: 744 };
    const edgeHouse = { x0: 158, y0: 60, x1: 190, y1: 90 };
    const panels = [topBar, rail, card, inspector];
    const layout = placeWindArrow({ view, map: corners(map), downwind: fromNorth, chipW: 50, chipH: 20, panels, buildings: [edgeHouse] });
    expect(layout.clear).toBe(true);
    expect(layout.bounds.x1).toBeLessThanOrEqual(map.x0 - WIND_ARROW_EDGE_GAP_PX);
    for (const r of [...panels, edgeHouse]) expect(rectsOverlap(layout.bounds, r, WIND_ARROW_CLEAR_PX)).toBe(false);
  });

  it("never puts a building within 24px of the chip or shaft while a clear spot exists", () => {
    const bar = { x0: 14, y0: 14, x1: 1426, y1: 160 };
    const houses: ScreenRect[] = [];
    for (let x = mapRect.x0 + 6; x < mapRect.x1; x += 40) houses.push({ x0: x, y0: mapRect.y0 + 4, x1: x + 24, y1: mapRect.y0 + 30 });
    houses.push({ x0: mapRect.x0 - 120, y0: 190, x1: mapRect.x0 - 60, y1: 240 });
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels: [bar], buildings: houses });
    expect(layout.clear).toBe(true);
    for (const h of houses) expect(rectsOverlap(layout.bounds, h, WIND_ARROW_CLEAR_PX)).toBe(false);
  });

  it("falls back inside the map, as far from buildings as it can, when no margin spot is clear", () => {
    const bar = { x0: 14, y0: 14, x1: 1426, y1: 160 };
    const left = { x0: 14, y0: 14, x1: mapRect.x0 - 10, y1: 886 };
    const right = { x0: mapRect.x1 + 10, y0: 14, x1: 1426, y1: 886 };
    const house = { x0: midX - 20, y0: 180, x1: midX + 20, y1: 300 };
    const panels = [bar, left, right];
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels, buildings: [house] });
    expect(layout.clear).toBe(false);
    expect(layout.bounds.y0).toBeGreaterThan(mapRect.y0);
    expect(rectsOverlap(layout.bounds, house, WIND_ARROW_CLEAR_PX)).toBe(false);
    for (const p of panels) expect(rectsOverlap(layout.bounds, p, WIND_ARROW_CLEAR_PX)).toBe(false);
  });

  it("picks the inside spot with the most building clearance when every spot is crowded", () => {
    const bar = { x0: 14, y0: 14, x1: 1426, y1: 160 };
    const left = { x0: 14, y0: 14, x1: mapRect.x0 - 10, y1: 886 };
    const right = { x0: mapRect.x1 + 10, y0: 14, x1: 1426, y1: 886 };
    const houses: ScreenRect[] = [];
    for (let x = mapRect.x0; x < mapRect.x1; x += 30) {
      if (x > midX + 100 && x < midX + 190) continue;
      for (let y = mapRect.y0; y < mapRect.y1; y += 30) houses.push({ x0: x, y0: y, x1: x + 14, y1: y + 14 });
    }
    const panels = [bar, left, right];
    const layout = placeWindArrow({ view, map: corners(mapRect), downwind: fromNorth, ...chip, panels, buildings: houses });
    expect(layout.clear).toBe(false);
    expect(layout.bounds.x0).toBeGreaterThan(midX + 94);
    expect(layout.bounds.x1).toBeLessThan(midX + 200);
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
