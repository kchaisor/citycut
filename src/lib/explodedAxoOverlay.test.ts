import { describe, expect, it } from "vitest";
import { vicmapWfsGetFeatureUrl } from "./vicmapWfs";
import { classifyPlanningSchemeForTest, planningWfsUrlForTest } from "./explodedAxoOverlayFetch.test-utils";
import { buildExplodedAxoLayers, defaultExplodedAxoSettings, explodedAxoBounds } from "./explodedAxo";
import { explodedAxoViewportExtent } from "./planViewport";
import { model } from "./aiExport.test";

describe("vicmap WFS urls", () => {
  it("uses CRS:84 bbox order for plan_overlay", () => {
    const url = vicmapWfsGetFeatureUrl(
      "open-data-platform:plan_overlay",
      { west: 144.99, south: -37.83, east: 144.999, north: -37.82 },
      { count: 10, propertyName: "scheme_code,geom" },
    );
    expect(decodeURIComponent(url)).toContain("open-data-platform:plan_overlay");
    expect(url).toContain("bbox=144.99%2C-37.83%2C144.999%2C-37.82%2CCRS%3A84");
  });
});

describe("planning overlay classes", () => {
  it("maps scheme codes to flood, heritage, ddo, and bmo", () => {
    expect(classifyPlanningSchemeForTest("LSIO")).toBe("flood");
    expect(classifyPlanningSchemeForTest("HO")).toBe("heritage");
    expect(classifyPlanningSchemeForTest("DDO")).toBe("ddo");
    expect(classifyPlanningSchemeForTest("BMO")).toBe("bmo");
    expect(classifyPlanningSchemeForTest("SCO")).toBeNull();
  });

  it("builds the same plan_overlay query as useCascade zones", () => {
    const bounds = { west: 144.99, south: -37.83, east: 144.999, north: -37.82 };
    expect(planningWfsUrlForTest(bounds)).toContain("plan_overlay");
    expect(planningWfsUrlForTest(bounds)).toContain("CRS%3A84");
  });
});

describe("exploded axo viewport stability", () => {
  it("does not change fitted extent when toggling a new overlay layer", () => {
    const m = model();
    const baseSettings = defaultExplodedAxoSettings(m.sideM);
    const baseFit = explodedAxoViewportExtent(explodedAxoBounds(m, baseSettings));
    const toggled = {
      ...baseSettings,
      layerVisible: { ...baseSettings.layerVisible, planning: true, transport: true },
    };
    const toggledFit = explodedAxoViewportExtent(explodedAxoBounds(m, toggled));
    expect(toggledFit).toEqual(baseFit);
  });

  it("keeps five default visible plates in geometry output", () => {
    const m = model();
    const { layers } = buildExplodedAxoLayers(m, defaultExplodedAxoSettings(m.sideM));
    expect(layers).toHaveLength(5);
  });
});
