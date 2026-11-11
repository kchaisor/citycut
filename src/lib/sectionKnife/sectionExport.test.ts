import { describe, expect, it } from "vitest";
import { buildSectionExportSvg, sectionExportLayerNames, SECTION_EXPORT_LAYERS } from "./sectionExport";
import { createSectionKnifeEntry } from "./state";

describe("section export", () => {
  it("names Section:: layers and includes a ground profile", () => {
    const model = {
      sideM: 200,
      center: { lat: -37.8, lon: 145.1 },
      buildings: [],
      roads: [],
      trees: [],
      terrain: { min: 70, max: 90, spacingM: 10, heights: new Float32Array(4), width: 2, originEast: -100, originNorth: -100 },
    } as unknown as import("../../types").CityModel;
    const knife = createSectionKnifeEntry(200);
    const svg = buildSectionExportSvg(model, knife.pose, { applyVerticalExaggeration: false, knife });
    const layers = sectionExportLayerNames(svg);
    for (const name of SECTION_EXPORT_LAYERS) {
      expect(layers).toContain(name);
    }
    expect(svg).toMatch(/Section::Ground/);
    expect(svg).toMatch(/polyline|path/);
    expect(svg).toContain("True scale");
  });
});
