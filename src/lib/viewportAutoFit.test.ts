import { describe, expect, it } from "vitest";
import { shouldKeepPresetPose, shouldSkipViewportSizeRefit } from "./viewportAutoFit";

describe("shouldSkipViewportSizeRefit", () => {
  it("skips a resize refit after the user has orbited at the same snap id", () => {
    expect(shouldSkipViewportSizeRefit("3:800x600", "3:640x480", 3, true)).toBe(true);
  });

  it("skips a resize refit at the same snap id even when the camera was not touched", () => {
    expect(shouldSkipViewportSizeRefit("3:1064x844", "3:1384x844", 3, false)).toBe(true);
  });

  it("fits the first time, with no earlier fit", () => {
    expect(shouldSkipViewportSizeRefit(null, "0:1064x844", 0, false)).toBe(false);
  });

  it("allows refit when the snap id changes", () => {
    expect(shouldSkipViewportSizeRefit("2:800x600", "3:800x600", 3, true)).toBe(false);
  });
});

describe("shouldKeepPresetPose", () => {
  it("runs the first fit in QA while the camera is still on the unfitted default", () => {
    expect(shouldKeepPresetPose(true, null, false)).toBe(false);
  });

  it("keeps a QA setCamera pose that landed before the first fit", () => {
    expect(shouldKeepPresetPose(true, null, true)).toBe(true);
  });

  it("never applies outside QA or once a fit has run", () => {
    expect(shouldKeepPresetPose(false, null, true)).toBe(false);
    expect(shouldKeepPresetPose(true, "0:1440x900", true)).toBe(false);
  });
});

