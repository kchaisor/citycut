import { describe, expect, it } from "vitest";
import {
  INITIAL_SIDEBAR_SECTION,
  SIDEBAR_SECTION_LABELS,
  SITE_ANALYSIS_KINDS,
  SITE_ANALYSIS_LABELS,
  availableSidebarSections,
  initialSidebarState,
  reduceSidebar,
  isRightSidebarSection,
  resolveSidebarSection,
} from "./sidebarSections";

describe("sidebar sections", () => {
  it("opens on Model details", () => {
    expect(INITIAL_SIDEBAR_SECTION).toBe("summary");
    expect(initialSidebarState()).toEqual({ section: "summary" });
  });

  it("lists Buildings and Trees only when the model has them and combines Sun/Wind/View into Site Analysis", () => {
    expect(availableSidebarSections({ buildings: true, trees: false })).toEqual([
      "summary",
      "buildings",
      "drawing",
      "analysis",
      "import",
      "exports",
    ]);
    expect(availableSidebarSections({ buildings: false, trees: true })).toContain("trees");
    expect(SIDEBAR_SECTION_LABELS.analysis).toBe("Site Analysis");
    expect(SITE_ANALYSIS_KINDS).toEqual(["solar", "wind", "view"]);
    expect(SITE_ANALYSIS_LABELS).toEqual({ solar: "Sun", wind: "Wind", view: "View" });
  });

  it("falls back to Model details when the chosen section is not available and maps legacy solar/wind/view to analysis", () => {
    expect(resolveSidebarSection("trees", ["summary", "drawing"])).toBe("summary");
    expect(resolveSidebarSection("drawing", ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection("solar", ["summary", "analysis"])).toBe("analysis");
    expect(resolveSidebarSection("wind", ["summary", "analysis"])).toBe("analysis");
    expect(resolveSidebarSection("view", ["summary", "analysis"])).toBe("analysis");
    expect(resolveSidebarSection(null, ["summary"])).toBe("summary");
  });

  it("switches sections; selecting the open section keeps it", () => {
    let state = initialSidebarState();
    state = reduceSidebar(state, { type: "select", id: "buildings" });
    expect(state).toEqual({ section: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "buildings" });
    expect(state).toEqual({ section: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "analysis" });
    expect(state).toEqual({ section: "analysis" });
  });

  it("returns to Model details for a new model", () => {
    const state = reduceSidebar({ section: "exports" }, { type: "new-model" });
    expect(state).toEqual({ section: "summary" });
  });
});

describe("Display section label", () => {
  it("names the 3D / Drawing / Satellite section Display, distinct from its Drawing sub-tab", () => {
    expect(SIDEBAR_SECTION_LABELS.drawing).toBe("Display");
    const labels = Object.values(SIDEBAR_SECTION_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).not.toContain("Drawing");
  });
});

describe("right-hand sidebar panels", () => {
  it("docks Model details, Buildings, and Trees on the right side of the page", () => {
    expect(isRightSidebarSection("summary")).toBe(true);
    expect(isRightSidebarSection("buildings")).toBe(true);
    expect(isRightSidebarSection("trees")).toBe(true);
    expect(isRightSidebarSection("drawing")).toBe(false);
    expect(isRightSidebarSection("exports")).toBe(false);
  });
});
