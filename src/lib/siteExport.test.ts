import { describe, expect, it } from "vitest";
import { parseNativeAiLayers } from "./aiNative";
import { SITE_LAYER_ORDER, sitePlanAi8, sitePlanChunks, sitePlanLayerOrder } from "./aiPlan";
import { DEFAULT_LINE_STYLES, screenPenAttrs } from "./drawingStyle";
import { getColour } from "./colours";
import { colourRgb } from "./colours";
import { model } from "./aiExport.test";
import type { Pt } from "../types";

describe("site exports", () => {
  it("registers --site-building in the theme", () => {
    expect(getColour("--site-building").toUpperCase()).toBe("#FFF500");
  });

  it("registers red --site-boundary on plan pens, exports, and Rhino", () => {
    expect(getColour("--site-boundary").toUpperCase()).toBe("#D7263D");
    expect(screenPenAttrs(DEFAULT_LINE_STYLES.siteBoundary).stroke).toBe("#D7263D");
    const withSite = {
      ...model(),
      siteBuildingIds: [1],
      siteBoundaryLines: [
        [
          [-20, -10],
          [20, -10],
          [20, 10],
          [-20, 10],
          [-20, -10],
        ],
      ] as Pt[][],
    };
    const boundary = sitePlanChunks(withSite, 1000, DEFAULT_LINE_STYLES).find(
      (chunk) => chunk.name === "Site boundary",
    );
    const rgb = colourRgb("--site-boundary");
    expect(boundary?.paths?.[0]?.stroke).toEqual([
      rgb.r / 255,
      rgb.g / 255,
      rgb.b / 255,
    ]);
    const ai = new TextDecoder().decode(sitePlanAi8(withSite, 1000));
    expect(ai).toContain("0.8431 0.149 0.2392");
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

  it("orders road fill above contour lines in site plan exports", () => {
    expect(SITE_LAYER_ORDER.indexOf("Roads")).toBeGreaterThan(SITE_LAYER_ORDER.indexOf("Contours"));
    expect(SITE_LAYER_ORDER.indexOf("Trams")).toBeGreaterThan(SITE_LAYER_ORDER.indexOf("Roads"));
    const chunks = sitePlanChunks(model(), 1000, DEFAULT_LINE_STYLES);
    const order = sitePlanLayerOrder(chunks);
    const contourIndex = order.indexOf("Contours");
    const roadIndex = order.indexOf("Roads");
    if (contourIndex >= 0 && roadIndex >= 0) {
      expect(roadIndex).toBeGreaterThan(contourIndex);
    }
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
