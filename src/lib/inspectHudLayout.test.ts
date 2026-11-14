import { describe, expect, it } from "vitest";
import { clampInspectHudPosition } from "./inspectHudLayout";

describe("inspectHudLayout", () => {
  it("offsets and clamps the HUD within the viewport", () => {
    const anchor = clampInspectHudPosition({
      anchorX: 700,
      anchorY: 400,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(anchor.left).toBeGreaterThanOrEqual(12);
    expect(anchor.top).toBeGreaterThanOrEqual(12);
  });

  it("nudges the HUD away from the lower-right compass safe zone", () => {
    const crowded = clampInspectHudPosition({
      anchorX: 1320,
      anchorY: 820,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(crowded.left).toBeLessThan(1200);
    expect(crowded.top).toBeLessThan(760);
  });
});
