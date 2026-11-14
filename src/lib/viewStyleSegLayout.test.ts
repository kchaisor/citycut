// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  VIEW_STYLE_SEG_LABELS,
  measureViewStyleLabelWidth,
  viewStyleSegLabelMaxWidth,
} from "./viewStyleSegLayout";

const TRACK_WIDTH_AT_VIEWPORT: Record<number, number> = {
  1280: 222,
  1440: 222,
};

describe("view style seg layout", () => {
  for (const [viewport, trackWidth] of Object.entries(TRACK_WIDTH_AT_VIEWPORT)) {
    it(`fits all segment labels within cells at ${viewport}px viewport (track ${trackWidth}px)`, () => {
      const maxLabel = viewStyleSegLabelMaxWidth(trackWidth);
      for (const label of VIEW_STYLE_SEG_LABELS) {
        const measured = measureViewStyleLabelWidth(label, 600);
        expect(measured).toBeLessThanOrEqual(maxLabel + 1);
      }
    });
  }
});
