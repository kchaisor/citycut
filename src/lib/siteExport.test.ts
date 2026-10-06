import { describe, expect, it } from "vitest";
import { parseNativeAiLayers } from "./aiNative";
import { sitePlanAi8, sitePlanChunks } from "./aiPlan";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { getColour } from "./colours";
import { model } from "./aiExport.test";
import type { Pt } from "../types";

describe("site exports", () => {
  it("registers --site-building in the theme", () => {
    expect(getColour("--site-building").toUpperCase()).toBe("#F2C230");
  });

  it("leaves site-plan layer names unchanged when site fields are absent", () => {
    const bare = model();
    const names = sitePlanChunks(bare, 1000, DEFAULT_LINE_STYLES)
      .map((chunk) => chunk.name)
      .sort();
    const emptySite = sitePlanChunks(
      { ...bare, siteBuildingIds: [], siteBoundaryLines: [] },
      1000,
      DEFAULT_LINE_STYLES,
    )
      .map((chunk) => chunk.name)
      .sort();
    expect(names).toEqual(emptySite);
  });

  it("writes Site buildings and Site boundary Illustrator layers", () => {
    const base = model();
    const withSite = {
      ...base,
      siteBuildingIds: [1],
      siteBoundaryLines: [
        [
          [-40, -40],
          [40, -40],
          [40, 40],
          [-40, 40],
          [-40, -40],
        ],
      ] as Pt[][],
    };
    const layers = parseNativeAiLayers(sitePlanAi8(withSite, 1000));
    expect(layers).toContain("Site buildings");
    expect(layers).toContain("Site boundary");
    const withoutSite = parseNativeAiLayers(sitePlanAi8(base, 1000));
    expect(withoutSite).not.toContain("Site buildings");
    expect(withoutSite).not.toContain("Site boundary");
  });
});
