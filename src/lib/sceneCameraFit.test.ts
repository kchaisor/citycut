import { describe, expect, it } from "vitest";
import { CAMERA_FIT_INCLUDES_HELIODON } from "./sceneCameraFit";

describe("solar camera fit", () => {
  it("never reframes the viewport to fit the sun path dome", () => {
    expect(CAMERA_FIT_INCLUDES_HELIODON).toBe(false);
  });
});
