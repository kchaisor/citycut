import { describe, expect, it } from "vitest";
import {
  INSPECT_HUD_DEFAULT_HEIGHT,
  INSPECT_HUD_DEFAULT_WIDTH,
  INSPECT_HUD_MARGIN,
  INSPECT_HUD_OFFSET,
  clampInspectHudPosition,
  inspectHudDock,
  inspectHudPlacement,
  measureInspectHudDock,
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

  describe("building card dock", () => {
    const viewport = { width: 1440, height: 900 };
    const topCentre = { left: 405, top: 14, right: 985, bottom: 56 };
    const topRight = { left: 1055, top: 14, right: 1426, bottom: 56 };
    const rightColumn = { left: 1098, top: 68, right: 1426, bottom: 700 };

    it("docks top-right of the scene, 16 px clear of the top bars and the right column", () => {
      const dock = inspectHudDock({ viewport, above: [topCentre, topRight], beside: [rightColumn] });
      expect(dock).toEqual({ left: 1098 - 16 - INSPECT_HUD_DEFAULT_WIDTH, top: 56 + 16 });
    });

    it("uses the plain top-right corner when nothing is in the way", () => {
      expect(inspectHudDock({ viewport })).toEqual({
        left: 1440 - 16 - INSPECT_HUD_DEFAULT_WIDTH,
        top: INSPECT_HUD_MARGIN,
      });
    });

    it("does not depend on where the selected building is on screen", () => {
      const dock = inspectHudDock({ viewport, above: [topCentre, topRight], beside: [rightColumn] });
      const glued = inspectHudPlacement({ clientX: 700, clientY: 400, inView: true }, null, viewport);
      expect(dock).not.toEqual(glued);
      expect(inspectHudDock({ viewport, above: [topCentre, topRight], beside: [rightColumn] })).toEqual(dock);
    });

    it("ignores bars that do not sit above the card and stays on screen in a narrow window", () => {
      const farLeft = { left: 14, top: 14, right: 290, bottom: 56 };
      expect(inspectHudDock({ viewport, above: [farLeft] }).top).toBe(INSPECT_HUD_MARGIN);
      const narrow = inspectHudDock({
        viewport: { width: 560, height: 700 },
        beside: [{ left: 218, top: 68, right: 546, bottom: 600 }],
      });
      expect(narrow.left).toBeGreaterThanOrEqual(INSPECT_HUD_MARGIN);
      expect(narrow.left + INSPECT_HUD_DEFAULT_WIDTH).toBeLessThanOrEqual(560 - INSPECT_HUD_MARGIN);
    });

    it("always measures to an on-screen position, never null", () => {
      const dock = measureInspectHudDock();
      expect(dock).not.toBeNull();
      expect(dock.left).toBeGreaterThanOrEqual(INSPECT_HUD_MARGIN);
      expect(dock.top).toBeGreaterThanOrEqual(INSPECT_HUD_MARGIN);
    });
  });
});
