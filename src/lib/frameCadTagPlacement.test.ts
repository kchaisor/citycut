import { describe, expect, it } from "vitest";
import { frameCadTagPlacement } from "./frameCadTagPlacement";

function rectsIntersect(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): boolean {
  return !(
    a.left + a.width <= b.left ||
    a.left >= b.left + b.width ||
    a.top + a.height <= b.top ||
    a.top >= b.top + b.height
  );
}

const CHIP = { width: 237, height: 22 };

const DOCK_1280: { left: number; top: number; width: number; height: number } = {
  left: 12,
  top: 683.1875,
  width: 1256,
  height: 98.8125,
};

const DOCK_1440 = {
  left: 46.734375,
  top: 683.1875,
  width: 1346.53125,
  height: 98.8125,
};

function chipLayoutRect(centerX: number, top: number) {
  return {
    left: centerX - CHIP.width / 2,
    top,
    width: CHIP.width,
    height: CHIP.height,
  };
}

function expectClearOfDock(
  frame: { left: number; top: number; width: number; height: number },
  dock: typeof DOCK_1280,
  viewportWidth: number,
) {
  const placement = frameCadTagPlacement(frame, dock, CHIP, viewportWidth);
  const chip = chipLayoutRect(placement.centerX, placement.top);
  expect(rectsIntersect(chip, dock)).toBe(false);
  expect(placement.mode).not.toBe("below");
}

describe("frameCadTagPlacement", () => {
  it("keeps the chip below the frame when the dock is far away", () => {
    const frame = { left: 200, top: 120, width: 400, height: 400 };
    const placement = frameCadTagPlacement(frame, DOCK_1280, CHIP, 1280);
    expect(placement.mode).toBe("below");
    expect(placement.top).toBe(frame.top + frame.height + 14);
  });

  it("avoids the dock at 1280×800 for A3 1:3500 and 1:5000", () => {
    const frame3500 = { left: 250.5, top: 124.109375, width: 778.984375, height: 551.78125 };
    const frame5000 = { left: 83.578125, top: 5.875, width: 1112.828125, height: 788.25 };
    expectClearOfDock(frame3500, DOCK_1280, 1280);
    expectClearOfDock(frame5000, DOCK_1280, 1280);
  });

  it("avoids the dock at 1440×800 for A3 1:3500 and 1:5000", () => {
    const frame3500 = { left: 330.5, top: 124.109375, width: 778.984375, height: 551.78125 };
    const frame5000 = { left: 163.578125, top: 5.875, width: 1112.828125, height: 788.25 };
    expectClearOfDock(frame3500, DOCK_1440, 1440);
    expectClearOfDock(frame5000, DOCK_1440, 1440);
  });
});
