import { describe, expect, it } from "vitest";
import { landingMapPadding } from "./landingPadding";

const desktopMap = { left: 0, top: 0, right: 1440, bottom: 900 };

describe("landingMapPadding", () => {
  it("desktop: pads by the controls' full right edge, so the frame centres in the visible map", () => {
    const pad = landingMapPadding(desktopMap, { left: 0, top: 0, right: 388, bottom: 900 });
    expect(pad).toEqual({ left: 388, top: 0, right: 0, bottom: 0 });
    // Camera centre = middle of the padded area = middle of what the user sees.
    expect((pad.left + desktopMap.right) / 2).toBe((388 + 1440) / 2);
  });

  it("desktop with the sidebar collapsed pads by the rail only", () => {
    expect(landingMapPadding(desktopMap, { left: 0, top: 0, right: 68, bottom: 900 }).left).toBe(68);
  });

  it("phone: no padding when the map already stops above the bottom sheet", () => {
    const map = { left: 0, top: 0, right: 390, bottom: 736 };
    expect(landingMapPadding(map, { left: 0, top: 736, right: 390, bottom: 844 })).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });

  it("phone: pads the bottom when the sheet overlaps the map", () => {
    const map = { left: 0, top: 0, right: 390, bottom: 844 };
    expect(landingMapPadding(map, { left: 0, top: 500, right: 390, bottom: 844 }).bottom).toBe(344);
  });

  it("never pads away more than 80% of the map, and handles missing controls", () => {
    expect(landingMapPadding({ left: 0, top: 0, right: 400, bottom: 900 }, { left: 0, top: 0, right: 390, bottom: 900 }).left).toBe(320);
    expect(landingMapPadding(desktopMap, null)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});
