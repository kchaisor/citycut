import { describe, expect, it } from "vitest";
import { shouldSkipViewportSizeRefit } from "./viewportAutoFit";

describe("shouldSkipViewportSizeRefit", () => {
  it("skips a resize refit after the user has orbited at the same snap id", () => {
    expect(shouldSkipViewportSizeRefit("3:800x600", "3:640x480", 3, true)).toBe(true);
  });

  it("skips a resize refit at the same snap id even when the camera was not touched", () => {
    // Sidebar collapse and window resize must not move the camera.
    expect(shouldSkipViewportSizeRefit("3:1064x844", "3:1384x844", 3, false)).toBe(true);
  });

  it("fits the first time, with no earlier fit", () => {
    expect(shouldSkipViewportSizeRefit(null, "0:1064x844", 0, false)).toBe(false);
  });

  it("allows refit when the snap id changes", () => {
    expect(shouldSkipViewportSizeRefit("2:800x600", "3:800x600", 3, true)).toBe(false);
  });
});
