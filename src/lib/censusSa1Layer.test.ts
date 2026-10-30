import { describe, expect, it } from "vitest";
import { CensusSa1Layer, rasterizeSa1Owners, sa1EdgeMask } from "./censusSa1Layer";
import type { Pt } from "../types";

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

describe("SA1 overlay raster", () => {
  it("assigns each cell to the SA1 that covers it, west and east halves", () => {
    const owners = rasterizeSa1Owners([{ rings: [rect(-60, -60, 0, 60)] }, { rings: [rect(0, -60, 60, 60)] }], 100, "square", 10);
    expect(owners[5 * 10 + 1]).toBe(0);
    expect(owners[5 * 10 + 8]).toBe(1);
    expect([...owners].filter((o) => o < 0)).toHaveLength(0);
  });

  it("leaves holes and cells outside a circular frame empty", () => {
    const owners = rasterizeSa1Owners([{ rings: [rect(-60, -60, 60, 60), rect(-10, -10, 10, 10)] }], 100, "circle", 20);
    expect(owners[10 * 20 + 10]).toBe(-1);
    expect(owners[0]).toBe(-1);
    expect(owners[10 * 20 + 3]).toBe(0);
  });

  it("maps row 0 to the southern edge", () => {
    const owners = rasterizeSa1Owners([{ rings: [rect(-50, -50, 50, -40)] }], 100, "square", 10);
    expect(owners[0]).toBe(0);
    expect(owners[9 * 10]).toBe(-1);
  });

  it("marks only the cells along a shared boundary as edges", () => {
    const owners = rasterizeSa1Owners([{ rings: [rect(-60, -60, 0, 60)] }, { rings: [rect(0, -60, 60, 60)] }], 100, "square", 10);
    const edges = sa1EdgeMask(owners, 10);
    expect(edges[3 * 10 + 4]).toBe(1);
    expect(edges[3 * 10 + 5]).toBe(1);
    expect(edges[3 * 10 + 1]).toBe(0);
  });

  it("starts hidden and builds one draped mesh when areas arrive", () => {
    const layer = new CensusSa1Layer({ sideM: 100, terrain: undefined }, "square");
    expect(layer.root.visible).toBe(false);
    layer.setAreas([{ code: "a", rings: [rect(-60, -60, 60, 60)], step: 2 }]);
    expect(layer.root.children).toHaveLength(1);
    layer.setHovered("a");
    layer.setVisible(true);
    expect(layer.root.visible).toBe(true);
    layer.setAreas([]);
    expect(layer.root.children).toHaveLength(0);
  });
});
