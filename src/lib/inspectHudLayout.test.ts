import { describe, expect, it } from "vitest";
import {
  INSPECT_HUD_DEFAULT_HEIGHT,
  INSPECT_HUD_DEFAULT_WIDTH,
  INSPECT_HUD_MARGIN,
  INSPECT_HUD_OFFSET,
  clampInspectHudPosition,
} from "./inspectHudLayout";

describe("inspectHudLayout", () => {
  it("sits 8 px beside the picked point", () => {
    expect(INSPECT_HUD_OFFSET).toBe(8);
    const anchor = clampInspectHudPosition({ anchorX: 700, anchorY: 400, viewportWidth: 1440, viewportHeight: 900 });
    expect(anchor).toEqual({ left: 708, top: 408 });
  });

  it("stays at least 16 px inside the viewport", () => {
    expect(INSPECT_HUD_MARGIN).toBe(16);
    const topLeft = clampInspectHudPosition({ anchorX: 0, anchorY: 0, viewportWidth: 1440, viewportHeight: 900 });
    expect(topLeft).toEqual({ left: 16, top: 16 });
    const bottomRight = clampInspectHudPosition({ anchorX: 1100, anchorY: 880, viewportWidth: 1440, viewportHeight: 900 });
    expect(bottomRight.top + INSPECT_HUD_DEFAULT_HEIGHT).toBeLessThanOrEqual(900 - 16);
    expect(bottomRight.left + INSPECT_HUD_DEFAULT_WIDTH).toBeLessThanOrEqual(1440 - 16);
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
