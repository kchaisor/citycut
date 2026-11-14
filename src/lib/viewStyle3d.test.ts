import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import {
  isWhiteCard3dView,
  usesPrimaryRoadCanvas,
  viewStyleFootpathChipColor,
  viewStyleRoadChipColor,
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
});
