import { describe, expect, it } from "vitest";
import {
  analysisCardCollapsed,
  analysisCardsOn,
  analysisStackTight,
  anyAnalysisCardOn,
  initialAnalysisCardFocus,
  nextAnalysisCardFocus,
  toggleAnalysisCard,
} from "./analysisCards";
import { NO_ANALYSES, analysesOf, toggleAnalysis } from "./sidebarSections";

describe("analysis cards", () => {
  it("shows a card per analysis that is on, in 3D and Drawing but not Satellite", () => {
    expect(analysisCardsOn("3d", analysesOf("solar", "view"))).toEqual({ solar: true, wind: false, view: true });
    expect(analysisCardsOn("drawing", analysesOf("wind"))).toEqual({ solar: false, wind: true, view: false });
    expect(analysisCardsOn("satellite", analysesOf("solar", "wind", "view"))).toEqual(NO_ANALYSES);
    expect(anyAnalysisCardOn("3d", NO_ANALYSES)).toBe(false);
    expect(anyAnalysisCardOn("3d", analysesOf("view"))).toBe(true);
    expect(anyAnalysisCardOn("satellite", analysesOf("view"))).toBe(false);
  });

  it("opens the analysis turned on last and folds the rest", () => {
    let analyses = NO_ANALYSES;
    let focus = initialAnalysisCardFocus(analyses);
    expect(focus.open).toBeNull();
    for (const kind of ["solar", "wind", "view"] as const) {
      analyses = toggleAnalysis(analyses, kind);
      focus = nextAnalysisCardFocus(focus, analyses);
      expect(focus.open).toBe(kind);
    }
    expect(analysisCardCollapsed(focus.open, "view")).toBe(false);
    expect(analysisCardCollapsed(focus.open, "solar")).toBe(true);
    expect(analysisCardCollapsed(focus.open, "wind")).toBe(true);
  });

  it("swaps the open body on a header click, and folds it on a second click", () => {
    const focus = initialAnalysisCardFocus(analysesOf("solar", "wind"));
    expect(focus.open).toBe("wind");
    const swapped = toggleAnalysisCard(focus, "solar");
    expect(swapped.open).toBe("solar");
    expect(toggleAnalysisCard(swapped, "solar").open).toBeNull();
  });

  it("keeps the open card when another analysis turns off, and falls back when the open one does", () => {
    const all = analysesOf("solar", "wind", "view");
    const focus = toggleAnalysisCard(initialAnalysisCardFocus(all), "wind");
    expect(nextAnalysisCardFocus(focus, toggleAnalysis(all, "view")).open).toBe("wind");
    expect(nextAnalysisCardFocus(focus, toggleAnalysis(all, "wind")).open).toBe("solar");
    expect(nextAnalysisCardFocus(initialAnalysisCardFocus(analysesOf("view")), NO_ANALYSES).open).toBeNull();
    expect(nextAnalysisCardFocus(focus, focus.seen)).toBe(focus);
  });

  it("calls the stack tight once two analysis cards share it", () => {
    expect(analysisStackTight("3d", analysesOf("wind"))).toBe(false);
    expect(analysisStackTight("3d", analysesOf("wind", "solar"))).toBe(true);
    expect(analysisStackTight("satellite", analysesOf("wind", "solar"))).toBe(false);
  });
});
