// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  VIEW_STYLE_SEG_COLUMNS,
  VIEW_STYLE_SEG_LABELS,
  VIEW_STYLE_SEG_OPTIONS,
  measureViewStyleLabelWidth,
  viewStyleSegSlackPx,
} from "./viewStyleSegLayout";

const TRACK_WIDTH_AT_VIEWPORT: Record<number, number> = {
  1280: 222,
  1440: 222,
};

const CHROMIUM_LABEL_WIDTH_PX: Record<string, number> = { Primary: 40, Use: 20, Source: 36, Card: 25, "B&W": 25 };

describe("view style seg layout", () => {
  it("lists Primary, Use, Source, Card and B&W, with B&W read out as Black and white", () => {
    expect(VIEW_STYLE_SEG_LABELS).toEqual(["Primary", "Use", "Source", "Card", "B&W"]);
    expect(VIEW_STYLE_SEG_COLUMNS).toBe(5);
    expect(VIEW_STYLE_SEG_OPTIONS.map((option) => option.id)).toEqual(["primary", "use", "source", "uniform", "mono"]);
    expect(VIEW_STYLE_SEG_OPTIONS.find((option) => option.id === "mono")?.name).toBe("Black and white");
  });

  for (const [viewport, trackWidth] of Object.entries(TRACK_WIDTH_AT_VIEWPORT)) {
    it(`fits all five segment labels on one row at ${viewport}px viewport (track ${trackWidth}px)`, () => {
      const chromium = VIEW_STYLE_SEG_LABELS.map((label) => CHROMIUM_LABEL_WIDTH_PX[label] ?? Number.POSITIVE_INFINITY);
      expect(viewStyleSegSlackPx(trackWidth, chromium)).toBeGreaterThanOrEqual(0);
      const measured = VIEW_STYLE_SEG_LABELS.map((label) => measureViewStyleLabelWidth(label, 600));
      expect(viewStyleSegSlackPx(trackWidth, measured)).toBeGreaterThanOrEqual(0);
    });
  }

  it("reports a negative slack when the labels cannot share one row", () => {
    expect(viewStyleSegSlackPx(120, VIEW_STYLE_SEG_LABELS.map((label) => CHROMIUM_LABEL_WIDTH_PX[label] ?? 0))).toBeLessThan(0);
  });
});
