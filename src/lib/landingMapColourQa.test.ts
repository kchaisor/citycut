import { describe, expect, it } from "vitest";
import { mergeDisplayedLandingFills } from "./landingMapColourQa";
import { BUILDING_USE_META } from "./buildingUse";

describe("mergeDisplayedLandingFills", () => {
  it("prefers live overlay fill over enrichment tile for the same overture id", () => {
    const tileFill = BUILDING_USE_META.retail.color;
    const liveFill = BUILDING_USE_META.civic.color;
    const merged = mergeDisplayedLandingFills([
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [] },
        properties: { overture_id: "f34c7007-f465-4b47-a45b-ac710884e5c7", use: "retail" },
        layer: { id: "citycut-enrichment-tiles-fill" },
        source: "",
        sourceLayer: "",
        state: {},
      } as unknown as maplibregl.MapGeoJSONFeature,
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [] },
        properties: { overture_id: "f34c7007-f465-4b47-a45b-ac710884e5c7", fill: liveFill },
        layer: { id: "citycut-cut-buildings-fill" },
        source: "",
        sourceLayer: "",
        state: {},
      } as unknown as maplibregl.MapGeoJSONFeature,
    ]);
    expect(merged.get("f34c7007-f465-4b47-a45b-ac710884e5c7")).toBe(liveFill);
    expect(tileFill).not.toBe(liveFill);
  });
});
