import { describe, expect, it } from "vitest";
import { capturePresetFromSearch, KELVIN_WATER_CAPTURE_SEARCH } from "./captureQuery";

describe("capture query presets", () => {
  it("reads uniform buildings and solar path from the query string", () => {
    const preset = capturePresetFromSearch(KELVIN_WATER_CAPTURE_SEARCH);
    expect(preset.uniformBuildings).toBe(true);
    expect(preset.solarPath).toBe(true);
  });
});
