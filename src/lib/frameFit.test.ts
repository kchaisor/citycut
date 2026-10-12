import { describe, expect, it } from "vitest";
import { FRAME_FIT_MARGIN_PX, frameSidePx, initialLandingZoom, zoomToFitFrame } from "./frameFit";

const PHONE = { widthPx: 390, heightPx: 844 - 55 - 52 };

describe("frame fit", () => {
  for (const km of [0.25, 0.5, 1, 1.2, 1.5, 2]) {
    for (const lat of [-37.8127, -37.84886, 0, 51.5]) {
      it(`fits a ${km} km frame on a phone at lat ${lat}`, () => {
        const zoom = initialLandingZoom({ zoom: 15, sideM: km * 1000, lat, ...PHONE, fit: true });
        const side = frameSidePx(km * 1000, lat, zoom);
        expect(side).toBeLessThanOrEqual(PHONE.widthPx - 2 * FRAME_FIT_MARGIN_PX + 1e-6);
        expect(zoom).toBeLessThanOrEqual(15);
      });
    }
  }

  it("fills the narrow side exactly when it has to zoom out", () => {
    const zoom = zoomToFitFrame(1000, -37.8127, PHONE.widthPx, PHONE.heightPx);
    expect(frameSidePx(1000, -37.8127, zoom)).toBeCloseTo(PHONE.widthPx - 2 * FRAME_FIT_MARGIN_PX, 6);
  });

  it("never zooms in past the requested zoom", () => {
    expect(initialLandingZoom({ zoom: 12, sideM: 250, lat: -37.8, ...PHONE, fit: true })).toBe(12);
  });

  it("keeps the desktop zoom exactly", () => {
    for (const zoom of [13, 14.5, 15, 16.25]) {
      expect(initialLandingZoom({ zoom, sideM: 2000, lat: -37.8, widthPx: 1440, heightPx: 860, fit: false })).toBe(zoom);
    }
  });
});
