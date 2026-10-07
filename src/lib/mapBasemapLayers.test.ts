import { describe, expect, it } from "vitest";
import { landingCutColourBeforeLayer } from "./mapBasemapLayers";

describe("landingCutColourBeforeLayer", () => {
  it("targets the waterway line layer when present", () => {
    const map = {
      getStyle: () => ({
        layers: [
          { id: "background", type: "background" },
          { id: "water", type: "fill" },
          { id: "waterway", type: "line" },
          { id: "highway_minor", type: "line" },
        ],
      }),
    };
    expect(landingCutColourBeforeLayer(map as never)).toBe("waterway");
  });
});
