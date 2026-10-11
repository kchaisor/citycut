import { describe, expect, it } from "vitest";
import { snapWhenTogglingIsoFreeRotate } from "./isoFreeRotate";

describe("iso free rotate toggle", () => {
  it("does not snap the camera when free rotate is toggled", () => {
    expect(snapWhenTogglingIsoFreeRotate()).toBe(false);
  });
});
