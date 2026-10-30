import { describe, expect, it, vi } from "vitest";
import {
  clampOffset,
  createSectionCutStore,
  cutLineEndpoints,
  DEFAULT_SECTION_CUT,
  formatOffset,
  keepsPoint,
  lookingDirection,
  maxOffsetM,
  normalizeAngle,
  offsetFromPoint,
  rotateAngle,
  sectionWorldPlane,
  settleOffset,
  snapOffset,
} from "./sectionCut";

describe("section cut geometry", () => {
  it("normalises angles into [0, 180)", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(180)).toBe(0);
    expect(normalizeAngle(-15)).toBe(165);
    expect(normalizeAngle(375)).toBe(15);
  });

  it("rotates in 15 degree steps from a snapped start", () => {
    expect(rotateAngle(0, 1)).toBe(15);
    expect(rotateAngle(7, 1)).toBe(15);
    expect(rotateAngle(0, -1)).toBe(165);
    expect(rotateAngle(165, 1)).toBe(0);
  });

  it("measures offset along the line normal", () => {
    expect(offsetFromPoint(0, 40, 0)).toBeCloseTo(40);
    expect(offsetFromPoint(40, 0, 90)).toBeCloseTo(-40);
  });

  it("clamps the plane to the cut diagonal", () => {
    expect(maxOffsetM(200)).toBeCloseTo(141.42, 1);
    expect(clampOffset(500, 200)).toBeCloseTo(141.42, 1);
    expect(clampOffset(-500, 200)).toBeCloseTo(-141.42, 1);
  });

  it("snaps to 5 m when close and stays free otherwise", () => {
    expect(snapOffset(9.2, 400)).toEqual({ offsetM: 10, snapped: true });
    expect(snapOffset(7.5, 400)).toEqual({ offsetM: 7.5, snapped: false });
    expect(snapOffset(9.2, 400, true)).toEqual({ offsetM: 9.2, snapped: false });
  });

  it("settles a released plane onto the 5 m grid inside the cut", () => {
    expect(settleOffset(12.4, 400)).toBe(10);
    expect(settleOffset(-7.6, 400)).toBe(-10);
    expect(settleOffset(999, 100)).toBeCloseTo(70.71, 1);
  });

  it("keeps the south side by default and the north side when flipped", () => {
    const base = { angleDeg: 0, offsetM: 10 };
    expect(keepsPoint({ ...base, flipped: false }, 0, 0)).toBe(true);
    expect(keepsPoint({ ...base, flipped: false }, 0, 20)).toBe(false);
    expect(keepsPoint({ ...base, flipped: true }, 0, 0)).toBe(false);
    expect(keepsPoint({ ...base, flipped: true }, 0, 20)).toBe(true);
  });

  it("builds a horizontal-normal world plane through the offset", () => {
    const plane = sectionWorldPlane({ angleDeg: 0, offsetM: 10, flipped: false });
    expect(plane.normal[1]).toBe(0);
    const onPlane = plane.normal[0] * 0 + plane.normal[2] * -10 + plane.constant;
    expect(onPlane).toBeCloseTo(0);
  });

  it("reports the view direction toward the kept side", () => {
    expect(lookingDirection({ angleDeg: 0, flipped: false })).toBe("S");
    expect(lookingDirection({ angleDeg: 0, flipped: true })).toBe("N");
    expect(lookingDirection({ angleDeg: 90, flipped: false })).toBe("E");
  });

  it("formats signed offsets", () => {
    expect(formatOffset(0)).toBe("0.0 m");
    expect(formatOffset(12.34)).toBe("+12.3 m");
    expect(formatOffset(-5)).toBe("−5.0 m");
  });

  it("places cut line endpoints on the plane", () => {
    const [a, b] = cutLineEndpoints({ angleDeg: 30, offsetM: 20 }, 300);
    expect(offsetFromPoint(a[0], a[1], 30)).toBeCloseTo(20);
    expect(offsetFromPoint(b[0], b[1], 30)).toBeCloseTo(20);
  });
});

describe("section cut store", () => {
  it("notifies only on real changes", () => {
    const store = createSectionCutStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ enabled: false });
    expect(listener).not.toHaveBeenCalled();
    store.set({ enabled: true, offsetM: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ ...DEFAULT_SECTION_CUT, enabled: true, offsetM: 5 });
  });
});
