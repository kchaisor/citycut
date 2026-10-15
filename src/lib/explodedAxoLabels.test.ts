import { describe, expect, it } from "vitest";
import {
  AXO_LAYER_IDS,
  axoLayerLabelAnchor,
  axoPlateColours,
  axoPlateLabelText,
  axoPlateRightCorner,
} from "./explodedAxo";
import { COLOUR_KEYS } from "./colours";

describe("exploded axo plate labels and colours", () => {
  it("puts a horizontal label at the right corner with a short leader", () => {
    for (const shape of ["square", "circle"] as const) {
      const [cx, cy] = axoPlateRightCorner(500, shape, 120);
      const a = axoLayerLabelAnchor(500, 120, shape);
      expect(a.rotateDeg).toBe(0);
      expect(a.leader.y1).toBe(cy);
      expect(a.leader.y2).toBe(cy);
      expect(a.leader.x1).toBeGreaterThan(cx);
      expect(a.leader.x2 - a.leader.x1).toBeLessThan(500 * 0.1);
      expect(a.x).toBeGreaterThan(a.leader.x2);
    }
  });

  it("uses reference-style text", () => {
    expect(axoPlateLabelText("trees")).toBe("Trees.");
    expect(axoPlateLabelText("green")).toBe("Green spaces.");
  });

  it("has a hex tint and edge token for every layer", () => {
    for (const id of AXO_LAYER_IDS) {
      expect(COLOUR_KEYS).toContain(`--axo-plate-${id}`);
      expect(COLOUR_KEYS).toContain(`--axo-edge-${id}`);
      const { tint, edge } = axoPlateColours(id);
      expect(tint).toMatch(/^#[0-9a-f]{6}$/i);
      expect(edge).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
