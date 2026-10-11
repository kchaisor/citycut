import { describe, expect, it } from "vitest";
import { shouldSkipViewportSizeRefit } from "./viewportAutoFit";

describe("shouldSkipViewportSizeRefit", () => {
  it("skips a resize refit after the user has orbited at the same snap id", () => {
    expect(shouldSkipViewportSizeRefit("3:800x600", "3:640x480", 3, true)).toBe(true);
  });

  it("allows refit when the snap id changes", () => {
    expect(shouldSkipViewportSizeRefit("2:800x600", "3:800x600", 3, true)).toBe(false);
  });
});
