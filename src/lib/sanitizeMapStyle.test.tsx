// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapAttribution } from "../components/MapAttribution";
import { sanitizeMapStyle } from "./sanitizeMapStyle";

describe("sanitizeMapStyle", () => {
  it("strips attribution from the style root and sources", () => {
    const style = sanitizeMapStyle({
      version: 8,
      sources: {
        evil: {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          attribution: '<img src=x onerror="alert(1)">',
        },
      },
      layers: [],
      attribution: '<script>alert("xss")</script>',
    });
    expect(style.attribution).toBeUndefined();
    expect(style.sources?.evil).not.toHaveProperty("attribution");
  });

  it("never inserts malicious attribution HTML into the DOM", () => {
    const evil = '<img src=x onerror="window.__citycutXss=1">';
    sanitizeMapStyle({
      version: 8,
      sources: {
        a: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: evil },
      },
      layers: [],
      attribution: evil,
    });
    const view = render(<MapAttribution basemap="map" />);
    expect(view.container.innerHTML).not.toContain("onerror");
    expect(view.container.innerHTML).not.toContain("<img");
    expect((window as { __citycutXss?: number }).__citycutXss).toBeUndefined();
  });
});
