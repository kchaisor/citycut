import { describe, expect, it } from "vitest";
import { groundWindDrawnWindows } from "./ground-wind-windows-lib.mjs";

const GROUND = [182, 182, 182];
const TRAIL = [30, 64, 175];
const ROOF = [217, 216, 215];

function frame(width, height, paint) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const p = (y * width + x) * 4;
      rgba[p] = r;
      rgba[p + 1] = g;
      rgba[p + 2] = b;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

const striped = (gap) => (x, y) => {
  if (gap(x, y)) return GROUND;
  return y % 12 === 0 ? TRAIL : GROUND;
};

describe("groundWindDrawnWindows", () => {
  it("passes an evenly trailed frame", () => {
    const rgba = frame(1440, 900, striped(() => false));
    const audit = groundWindDrawnWindows(rgba, 1440, 900);
    expect(audit.windows.length).toBeGreaterThan(50);
    expect(audit.ok).toBe(true);
  });

  it("fails when the right strip has no drawn trails", () => {
    const rgba = frame(1440, 900, striped((x) => x >= 1158));
    const audit = groundWindDrawnWindows(rgba, 1440, 900);
    expect(audit.ok).toBe(false);
    expect(audit.worst.x0).toBeGreaterThanOrEqual(1100);
    expect(audit.worst.ratio).toBeLessThan(0.35);
  });

  it("ignores windows that are mostly roof", () => {
    const rgba = frame(1440, 900, (x, y) => (x < 400 && y < 400 ? ROOF : y % 12 === 0 ? TRAIL : GROUND));
    const audit = groundWindDrawnWindows(rgba, 1440, 900);
    expect(audit.windows.some((w) => w.x0 === 0 && w.y0 === 0)).toBe(false);
    expect(audit.ok).toBe(true);
  });

  it("skips windows above minYCssPx", () => {
    const rgba = frame(1440, 900, (x, y) => (y < 300 ? GROUND : y % 12 === 0 ? TRAIL : GROUND));
    const scoped = groundWindDrawnWindows(rgba, 1440, 900, 1, { minYCssPx: 300 });
    expect(scoped.windows.every((w) => w.y0 >= 300)).toBe(true);
    expect(scoped.ok).toBe(true);
  });

  it("reports window origins in CSS pixels when the frame is scaled", () => {
    const rgba = frame(720, 450, striped((x) => x >= 579));
    const audit = groundWindDrawnWindows(rgba, 720, 450, 0.5);
    expect(audit.ok).toBe(false);
    expect(audit.worst.x0).toBeGreaterThanOrEqual(1100);
  });
});
