import { describe, expect, it } from "vitest";
import { landingCutBuildingsBeforeLayer, landingCutLanduseBeforeLayer } from "./mapBasemapLayers";

const positronSlice = [
  { id: "landcover_wood", type: "fill" },
  { id: "waterway", type: "line" },
  { id: "building", type: "fill" },
  { id: "tunnel_motorway_casing", type: "line" },
  { id: "highway_minor", type: "line" },
];

describe("landingCutLanduseBeforeLayer", () => {
  it("targets the waterway line layer when present", () => {
    const map = { getStyle: () => ({ layers: positronSlice }) };
    expect(landingCutLanduseBeforeLayer(map as never)).toBe("waterway");
  });
});

describe("landingCutBuildingsBeforeLayer", () => {
  it("targets the first road line after basemap building", () => {
    const map = { getStyle: () => ({ layers: positronSlice }) };
    expect(landingCutBuildingsBeforeLayer(map as never)).toBe("tunnel_motorway_casing");
  });
});
