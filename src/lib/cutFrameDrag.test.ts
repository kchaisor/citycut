import { describe, expect, it } from "vitest";
import {
  clampCutSideM,
  fixedCornerForHandle,
  oppositeCutHandle,
  squareCutFromCornerDrag,
} from "./cutFrameDrag";

const center = { lon: 144.96, lat: -37.81 };

describe("cutFrameDrag", () => {
  it("pairs opposite handles", () => {
    expect(oppositeCutHandle("nw")).toBe("se");
    expect(oppositeCutHandle("se")).toBe("nw");
  });

  it("keeps the fixed corner when dragging the south-east handle", () => {
    const sideM = 1000;
    const fixed = fixedCornerForHandle(center, sideM, "se");
    const dragged = { lon: fixed.lon + 0.012, lat: fixed.lat - 0.01 };
    const next = squareCutFromCornerDrag("nw", fixed, dragged);
    expect(next.sideM).toBeGreaterThan(1000);
    const fixedAgain = fixedCornerForHandle(next.center, next.sideM, "se");
    expect(fixedAgain.lon).toBeCloseTo(fixed.lon, 5);
    expect(fixedAgain.lat).toBeCloseTo(fixed.lat, 5);
  });

  it("clamps cut side length to configured min and max", () => {
    expect(clampCutSideM(50)).toBe(250);
    expect(clampCutSideM(5000)).toBe(2000);
  });
});
