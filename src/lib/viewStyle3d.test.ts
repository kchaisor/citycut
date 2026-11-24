import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import {
  isWhiteCard3dView,
  usesPrimaryRoadCanvas,
  viewStyleFootpathChipColor,
  viewStyleFootpathColourTokens,
  viewStyleRoadChipColor,
  viewStyleRoadColourTokens,
} from "./viewStyle3d";

describe("viewStyle3d", () => {
  it("maps roads and footpaths to primary tokens in Primary, Use, and Source", () => {
    expect(usesPrimaryRoadCanvas(true, false, false)).toBe(true);
    expect(usesPrimaryRoadCanvas(false, true, false)).toBe(true);
    expect(usesPrimaryRoadCanvas(false, false, true)).toBe(true);
    expect(viewStyleRoadChipColor(false, true, false)).toBe(getColour("--primary-road"));
    expect(viewStyleFootpathChipColor(false, false, true)).toBe(getColour("--primary-footpath"));
  });

  it("maps Card view layer chips to white surface", () => {
    expect(isWhiteCard3dView(false, false, false)).toBe(true);
    expect(viewStyleRoadChipColor(false, false, false)).toBe(getColour("--primary-surface"));
    expect(viewStyleFootpathChipColor(false, false, false)).toBe(getColour("--primary-surface"));
  });

  it("writes the primary tokens plus the drawing tokens in Primary, Use and Source", () => {
    for (const [p, u, src] of [
      [true, false, false],
      [false, true, false],
      [false, false, true],
    ] as const) {
      expect(viewStyleRoadColourTokens(p, u, src)).toEqual([
        "--primary-road",
        "--road-local",
        "--road-arterial",
        "--road-fill",
      ]);
      expect(viewStyleFootpathColourTokens(p, u, src)).toEqual(["--primary-footpath", "--road-path", "--path-fill"]);
    }
  });

  it("writes only drawing tokens in Card and never the shared primary surface", () => {
    expect(viewStyleRoadColourTokens(false, false, false)).toEqual(["--road-local", "--road-arterial", "--road-fill"]);
    expect(viewStyleFootpathColourTokens(false, false, false)).toEqual(["--road-path", "--path-fill"]);
    expect(viewStyleRoadColourTokens(true, false, false)).not.toContain("--primary-surface");
    expect(viewStyleFootpathColourTokens(true, false, false)).not.toContain("--primary-surface");
  });
});
