import { describe, expect, it } from "vitest";
import {
  INSPECT_HUD_DEFAULT_HEIGHT,
  INSPECT_HUD_DEFAULT_WIDTH,
  INSPECT_HUD_MARGIN,
  INSPECT_HUD_OFFSET,
  clampInspectHudPosition,
  inspectHudPlacement,
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

  it("keeps the card floating on screen when the world anchor projects off-screen", () => {
    const viewport = { width: 1440, height: 900 };
    const offTop = inspectHudPlacement({ clientX: 700, clientY: -2400, inView: false }, null, viewport);
    expect(offTop).toEqual({ left: 708, top: INSPECT_HUD_MARGIN });
    const behind = inspectHudPlacement({ clientX: Number.NaN, clientY: Number.POSITIVE_INFINITY, inView: false }, null, viewport);
    expect(behind).not.toBeNull();
    expect(behind!.left).toBeGreaterThanOrEqual(INSPECT_HUD_MARGIN);
    expect(behind!.left + INSPECT_HUD_DEFAULT_WIDTH).toBeLessThanOrEqual(1440 - INSPECT_HUD_MARGIN);
    expect(behind!.top).toBeGreaterThanOrEqual(INSPECT_HUD_MARGIN);
    expect(behind!.top + INSPECT_HUD_DEFAULT_HEIGHT).toBeLessThanOrEqual(900 - INSPECT_HUD_MARGIN);
  });

  it("falls back to the last click when the world anchor is off-screen", () => {
    const viewport = { width: 1440, height: 900 };
    const placed = inspectHudPlacement(
      { clientX: 5200, clientY: -2400, inView: false },
      { clientX: 600, clientY: 300 },
      viewport,
    );
    expect(placed).toEqual({ left: 608, top: 308 });
  });

  it("follows the world anchor while it is in view and stays empty with no anchor", () => {
    const viewport = { width: 1440, height: 900 };
    expect(inspectHudPlacement({ clientX: 700, clientY: 400, inView: true }, { clientX: 10, clientY: 10 }, viewport)).toEqual({
      left: 708,
      top: 408,
    });
    expect(inspectHudPlacement(null, { clientX: 10, clientY: 10 }, viewport)).toBeNull();
  });
});
