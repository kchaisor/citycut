import { describe, expect, it } from "vitest";
import { ISO_FIT_MARGIN } from "./isoCamera";
import { sitePlanBounds } from "./planCamera";
import { sheetCropRect } from "./captureViewportPng";
import { WIND_SHEET_FRAMING, wholeSiteFraming } from "./sheetFraming";
import { windSheetCropOption } from "./windSheet";

const CANVAS = { width: 1440, height: 900 };

function projected(framing: ReturnType<typeof wholeSiteFraming>, x: number, z: number) {
  return { x: CANVAS.width / 2 + (x - framing.targetX) * framing.zoom, y: CANVAS.height / 2 + (z - framing.targetZ) * framing.zoom };
}

describe("wholeSiteFraming", () => {
  it("is the sheet's default framing", () => {
    expect(WIND_SHEET_FRAMING).toBe("whole-site");
  });

  it.each([
    ["square", 1000, 1000],
    ["wide", 1470, 1040],
    ["very wide", 2000, 400],
    ["tall", 400, 1200],
  ])("fits a %s site inside the sheet crop with a margin", (_name, width, height) => {
    const bounds = sitePlanBounds(Math.max(width, height), 0, 60, width, height);
    const crop = sheetCropRect(CANVAS, { x: 0, y: 0, width: 1100, height: 900 }, windSheetCropOption(false).aspect);
    const framing = wholeSiteFraming(bounds, CANVAS, crop);
    const lo = projected(framing, bounds.min[0], bounds.min[2]);
    const hi = projected(framing, bounds.max[0], bounds.max[2]);
    expect(lo.x).toBeGreaterThan(crop.x);
    expect(lo.y).toBeGreaterThan(crop.y);
    expect(hi.x).toBeLessThan(crop.x + crop.width);
    expect(hi.y).toBeLessThan(crop.y + crop.height);
    const fillX = (hi.x - lo.x) / crop.width;
    const fillY = (hi.y - lo.y) / crop.height;
    expect(Math.max(fillX, fillY)).toBeGreaterThan(0.88);
    expect(Math.max(fillX, fillY)).toBeLessThan(1);
    expect((lo.x + hi.x) / 2).toBeCloseTo(crop.x + crop.width / 2, 6);
    expect((lo.y + hi.y) / 2).toBeCloseTo(crop.y + crop.height / 2, 6);
  });

  it("does not depend on any saved zoom or pan, and centres an off-centre site", () => {
    const bounds = sitePlanBounds(500, 0, 40, 600, 400);
    const crop = { x: 300, y: 50, width: 900, height: 700 };
    const framing = wholeSiteFraming(bounds, CANVAS, crop);
    expect(framing.zoom).toBeCloseTo(Math.min(900 / 600, 700 / 400) / ISO_FIT_MARGIN, 6);
    const centre = projected(framing, 0, 0);
    expect(centre.x).toBeCloseTo(750, 6);
    expect(centre.y).toBeCloseTo(400, 6);
  });
});
