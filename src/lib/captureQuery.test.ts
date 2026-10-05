import { describe, expect, it } from "vitest";
import {
  cameraFromSearch,
  capturePresetFromSearch,
  formatCameraSearch,
  KELVIN_WATER_CAPTURE_SEARCH,
} from "./captureQuery";

describe("capture query presets", () => {
  it("reads uniform buildings and solar path from the query string", () => {
    const preset = capturePresetFromSearch(KELVIN_WATER_CAPTURE_SEARCH);
    expect(preset.uniformBuildings).toBe(true);
    expect(preset.solarPath).toBe(true);
  });
});

describe("cameraFromSearch", () => {
  it("reads a six-number cam pose", () => {
    expect(cameraFromSearch("?lat=-37.82&cam=400,150,20,10,12,-30")).toEqual({
      position: [400, 150, 20],
      target: [10, 12, -30],
    });
  });

  it("ignores missing or invalid cam values", () => {
    expect(cameraFromSearch("?lat=-37.82")).toBeNull();
    expect(cameraFromSearch("?cam=1,2,3")).toBeNull();
    expect(cameraFromSearch("?cam=1,2,3,4,5,nope")).toBeNull();
    expect(cameraFromSearch("?cam=")).toBeNull();
  });

  it("round-trips formatCameraSearch", () => {
    const pose = { position: [400.5, 150, -12.25] as [number, number, number], target: [10, 8, 0] as [number, number, number] };
    expect(cameraFromSearch(`?${formatCameraSearch(pose.position, pose.target)}`)).toEqual(pose);
  });
});
