// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  VIEW_STYLE_SEG_ACTIVE_FONT_WEIGHT,
  VIEW_STYLE_SEG_CELL_PADDING_X_PX,
  VIEW_STYLE_SEG_COLUMNS,
  VIEW_STYLE_SEG_FONT_SIZE_PX,
  VIEW_STYLE_SEG_FONT_WEIGHT,
  VIEW_STYLE_SEG_HEIGHT_PX,
  VIEW_STYLE_SEG_LABELS,
  VIEW_STYLE_SEG_OPTIONS,
  measureViewStyleLabelWidth,
  viewStyleSegSlackPx,
} from "./viewStyleSegLayout";

const TRACK_WIDTH_AT_VIEWPORT: Record<number, number> = {
  1280: 222,
  1440: 222,
};

const CHROMIUM_LABEL_WIDTH_PX: Record<string, number> = {
  Primary: 40,
  Use: 19.703125,
  Src: 17.28125,
  Card: 24.5625,
  "B&W": 24.90625,
};
const CHROMIUM_ACTIVE_LABEL_WIDTH_PX: Record<string, number> = {
  Primary: 41.03125,
  Use: 20.109375,
  Src: 17.796875,
  Card: 25.140625,
  "B&W": 25.625,
};
const CHROMIUM_FULL_SOURCE_LABEL_WIDTH_PX = 36.453125;

describe("view style seg layout", () => {
  it("lists Primary, Use, Src, Card and B&W, with Src read out as Source and B&W as Black and white", () => {
    expect(VIEW_STYLE_SEG_LABELS).toEqual(["Primary", "Use", "Src", "Card", "B&W"]);
    expect(VIEW_STYLE_SEG_OPTIONS.find((option) => option.id === "source")?.name).toBe("Source");
    expect(VIEW_STYLE_SEG_COLUMNS).toBe(5);
    expect(VIEW_STYLE_SEG_OPTIONS.map((option) => option.id)).toEqual(["primary", "use", "source", "uniform", "mono"]);
    expect(VIEW_STYLE_SEG_OPTIONS.find((option) => option.id === "mono")?.name).toBe("Black and white");
  });

  for (const [viewport, trackWidth] of Object.entries(TRACK_WIDTH_AT_VIEWPORT)) {
    it(`fits all five segment labels on one row at ${viewport}px viewport (track ${trackWidth}px)`, () => {
      for (const active of VIEW_STYLE_SEG_LABELS) {
        const chromium = VIEW_STYLE_SEG_LABELS.map(
          (label) =>
            (label === active ? CHROMIUM_ACTIVE_LABEL_WIDTH_PX[label] : CHROMIUM_LABEL_WIDTH_PX[label]) ??
            Number.POSITIVE_INFINITY,
        );
        expect(viewStyleSegSlackPx(trackWidth, chromium), active).toBeGreaterThanOrEqual(0);
      }
      const measured = VIEW_STYLE_SEG_LABELS.map((label) => measureViewStyleLabelWidth(label, VIEW_STYLE_SEG_ACTIVE_FONT_WEIGHT));
      expect(viewStyleSegSlackPx(trackWidth, measured)).toBeGreaterThanOrEqual(0);
    });
  }

  it("is 32 high with Geist 11 / 500 labels and 8 px of padding each side", () => {
    expect(VIEW_STYLE_SEG_HEIGHT_PX).toBe(32);
    expect(VIEW_STYLE_SEG_FONT_SIZE_PX).toBe(11);
    expect(VIEW_STYLE_SEG_FONT_WEIGHT).toBe(500);
    expect(VIEW_STYLE_SEG_CELL_PADDING_X_PX).toBe(8);
  });

  it("needs Src: the full Source label does not fit the 222 px track at 11 / 500 with 8 px padding", () => {
    const full = VIEW_STYLE_SEG_LABELS.map((label) =>
      label === "Src" ? CHROMIUM_FULL_SOURCE_LABEL_WIDTH_PX : (CHROMIUM_LABEL_WIDTH_PX[label] ?? 0),
    );
    expect(viewStyleSegSlackPx(222, full)).toBeLessThan(0);
  });

  it("reports a negative slack when the labels cannot share one row", () => {
    expect(viewStyleSegSlackPx(120, VIEW_STYLE_SEG_LABELS.map((label) => CHROMIUM_LABEL_WIDTH_PX[label] ?? 0))).toBeLessThan(0);
  });
});
