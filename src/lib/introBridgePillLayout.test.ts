import { describe, expect, it } from "vitest";
import { loadingPillOverlapsHudCard } from "./introBridgePillLayout";

describe("intro bridge pill layout", () => {
  it("does not intersect when the pill sits 8px below the header card", () => {
    const card = { top: 16, left: 400, right: 1040, bottom: 58, width: 640, height: 42, x: 400, y: 16, toJSON: () => ({}) };
    const pill = { top: 66, left: 520, right: 920, bottom: 102, width: 400, height: 36, x: 520, y: 66, toJSON: () => ({}) };
    expect(loadingPillOverlapsHudCard(pill, card, 8)).toBe(false);
  });

  it("detects overlap when the pill shares the header card band", () => {
    const card = { top: 16, left: 400, right: 1040, bottom: 58, width: 640, height: 42, x: 400, y: 16, toJSON: () => ({}) };
    const pill = { top: 20, left: 520, right: 920, bottom: 56, width: 400, height: 36, x: 520, y: 20, toJSON: () => ({}) };
    expect(loadingPillOverlapsHudCard(pill, card, 8)).toBe(true);
  });
});
