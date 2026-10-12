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
    expect(initialSidebarState()).toEqual({ section: "summary" });
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

  it("switches sections; selecting the open section keeps it", () => {
    let state = initialSidebarState();
    state = reduceSidebar(state, { type: "select", id: "buildings" });
    expect(state).toEqual({ section: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "buildings" });
    expect(state).toEqual({ section: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "wind" });
    expect(state).toEqual({ section: "wind" });
  });

  it("returns to Model details for a new model", () => {
    const state = reduceSidebar({ section: "exports" }, { type: "new-model" });
    expect(state).toEqual({ section: "summary" });
  });
});
