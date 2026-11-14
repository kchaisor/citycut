import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GROUND_WIND_EMPTY_MASK_RECT,
  groundWindMaskedAt,
  groundWindMaskRectFromClient,
  type GroundWindHudMask,
} from "./groundWindHudMask";

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

const canvas = rect(0, 0, 1440, 900);

describe("groundWindHudMask", () => {
  it("masks only the inspector card, leaving the ground below it drawable", () => {
    const mask: GroundWindHudMask = {
      right: groundWindMaskRectFromClient(rect(1158, 68, 1424, 450), canvas),
      bottom: groundWindMaskRectFromClient(rect(216, 802, 1224, 888), canvas),
    };
    expect(groundWindMaskedAt(mask, 1300, 200)).toBe(true);
    expect(groundWindMaskedAt(mask, 700, 850)).toBe(true);
    expect(groundWindMaskedAt(mask, 1300, 600)).toBe(false);
    expect(groundWindMaskedAt(mask, 1300, 30)).toBe(false);
    expect(groundWindMaskedAt(mask, 700, 40)).toBe(false);
  });

  it("measures cards relative to an offset canvas and clamps to it", () => {
    const offset = rect(100, 50, 1540, 950);
    expect(groundWindMaskRectFromClient(rect(1258, 118, 1600, 500), offset)).toEqual({ x0: 1158, y0: 68, x1: 1440, y1: 450 });
  });

  it("masks nothing when a card is absent, hidden, or off-canvas", () => {
    expect(groundWindMaskRectFromClient(null, canvas)).toBe(GROUND_WIND_EMPTY_MASK_RECT);
    expect(groundWindMaskRectFromClient(rect(10, 10, 10, 10), canvas)).toBe(GROUND_WIND_EMPTY_MASK_RECT);
    expect(groundWindMaskRectFromClient(rect(1500, 0, 1600, 100), canvas)).toBe(GROUND_WIND_EMPTY_MASK_RECT);
    const empty: GroundWindHudMask = { right: GROUND_WIND_EMPTY_MASK_RECT, bottom: GROUND_WIND_EMPTY_MASK_RECT };
    expect(groundWindMaskedAt(empty, 0, 0)).toBe(false);
    expect(groundWindMaskedAt(empty, 1, 1)).toBe(false);
  });

  it("tests the mask in y-down CSS pixels in the fragment shader", () => {
    const src = readFileSync(new URL("../components/GroundWindFlow.tsx", import.meta.url), "utf8");
    const fragment = src.slice(src.indexOf("const FRAGMENT_SHADER"));
    expect(fragment).toContain("vec2 css = vec2(vScreenPx.x, resolution.y - vScreenPx.y);");
    expect(fragment).not.toMatch(/vScreenPx\.y\s*>=\s*mask/);
  });
});
