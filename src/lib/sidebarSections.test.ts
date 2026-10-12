import { describe, expect, it } from "vitest";
import {
  INITIAL_SIDEBAR_SECTION,
  availableSidebarSections,
  initialSidebarState,
  reduceSidebar,
  resolveSidebarSection,
} from "./sidebarSections";

describe("sidebar sections", () => {
  it("opens on Model details", () => {
    expect(INITIAL_SIDEBAR_SECTION).toBe("summary");
    expect(initialSidebarState()).toEqual({ section: "summary", collapsed: false });
  });

  it("lists Buildings and Trees only when the model has them", () => {
    expect(availableSidebarSections({ buildings: true, trees: false })).toEqual([
      "summary",
      "buildings",
      "drawing",
      "solar",
      "wind",
      "exports",
    ]);
    expect(availableSidebarSections({ buildings: false, trees: true })).toContain("trees");
  });

  it("falls back to Model details when the chosen section is not available", () => {
    expect(resolveSidebarSection("trees", ["summary", "drawing"])).toBe("summary");
    expect(resolveSidebarSection("drawing", ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection(null, ["summary"])).toBe("summary");
  });

  it("switches sections without closing, collapses only from the collapse button", () => {
    let state = initialSidebarState();
    state = reduceSidebar(state, { type: "select", id: "buildings" });
    expect(state).toEqual({ section: "buildings", collapsed: false });
    state = reduceSidebar(state, { type: "select", id: "buildings" });
    expect(state).toEqual({ section: "buildings", collapsed: false });
    state = reduceSidebar(state, { type: "toggle-collapse" });
    expect(state).toEqual({ section: "buildings", collapsed: true });
    state = reduceSidebar(state, { type: "select", id: "wind" });
    expect(state).toEqual({ section: "wind", collapsed: false });
  });

  it("returns to Model details, open, for a new model", () => {
    const state = reduceSidebar({ section: "exports", collapsed: true }, { type: "new-model" });
    expect(state).toEqual({ section: "summary", collapsed: false });
  });
});
