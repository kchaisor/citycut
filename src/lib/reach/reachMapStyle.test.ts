import { describe, expect, it } from "vitest";
import { reachHexFillOpacity, REACH_HEX_FILL_OPACITY_FAR, REACH_HEX_FILL_OPACITY_NEAR } from "./reachMapStyle";

describe("reachHexFillOpacity", () => {
  it("is strongest near the origin minute", () => {
    expect(reachHexFillOpacity(1, 25)).toBeCloseTo(REACH_HEX_FILL_OPACITY_NEAR, 5);
  });

  it("fades to the far value at the budget limit", () => {
    expect(reachHexFillOpacity(25, 25)).toBeCloseTo(REACH_HEX_FILL_OPACITY_FAR, 5);
    expect(reachHexFillOpacity(25, 25)).toBeLessThan(0.2);
  });
});
