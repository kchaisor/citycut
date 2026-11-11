import { describe, expect, it } from "vitest";
import {
  INITIAL_LEFT_SIDEBAR_SECTION,
  INITIAL_RIGHT_SIDEBAR_SECTION,
  INITIAL_SIDEBAR_SECTION,
  LEFT_SIDEBAR_SECTION_IDS,
  RIGHT_SIDEBAR_SECTION_IDS,
  SIDEBAR_SECTION_LABELS,
  SITE_ANALYSIS_KINDS,
  SITE_ANALYSIS_LABELS,
  availableSidebarSections,
  initialSidebarState,
  isLeftSidebarSection,
  isRightSidebarSection,
  reduceSidebar,
  resolveLeftSidebarSection,
  resolveRightSidebarSection,
  resolveSidebarSection,
} from "./sidebarSections";

describe("sidebar sections", () => {
  it("opens with Display on the left and Model details on the right by default", () => {
    expect(INITIAL_SIDEBAR_SECTION).toBe("drawing");
    expect(INITIAL_LEFT_SIDEBAR_SECTION).toBe("drawing");
    expect(INITIAL_RIGHT_SIDEBAR_SECTION).toBe("summary");
    expect(initialSidebarState()).toEqual({ section: "drawing", rightSection: "summary" });
  });

  it("always lists all three right-hand tabs (Model details, Buildings, Trees) and combines Sun/Wind/View into Site Analysis, even when buildings or trees are empty", () => {
    expect(availableSidebarSections({ buildings: true, trees: false })).toEqual([
      "summary",
      "buildings",
      "trees",
      "drawing",
      "analysis",
      "import",
      "exports",
    ]);
    expect(availableSidebarSections({ buildings: false, trees: false })).toEqual([
      "summary",
      "buildings",
      "trees",
      "drawing",
      "analysis",
      "import",
      "exports",
    ]);
    expect(availableSidebarSections({ buildings: false, trees: true })).toContain("trees");
    expect(SIDEBAR_SECTION_LABELS.analysis).toBe("Site Analysis");
    expect(SITE_ANALYSIS_KINDS).toEqual(["solar", "wind", "view", "walkRipple"]);
    expect(SITE_ANALYSIS_LABELS).toEqual({ solar: "Sun", wind: "Wind", view: "View", walkRipple: "Walk" });
  });

  it("falls back to Display on the left and Model details on the right when a section is not available, and maps legacy solar/wind/view to analysis", () => {
    expect(resolveSidebarSection("trees", ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection("drawing", ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection("solar", ["summary", "analysis"])).toBe("analysis");
    expect(resolveSidebarSection("wind", ["summary", "analysis"])).toBe("analysis");
    expect(resolveSidebarSection("view", ["summary", "analysis"])).toBe("analysis");
    expect(resolveSidebarSection(null, ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection(null, ["summary"])).toBe("summary");

    expect(resolveLeftSidebarSection("analysis", ["summary", "drawing", "analysis"])).toBe("analysis");
    expect(resolveLeftSidebarSection("solar", ["summary", "drawing", "analysis"])).toBe("analysis");
    expect(resolveLeftSidebarSection("buildings", ["summary", "drawing", "analysis"])).toBe("drawing");
    expect(resolveRightSidebarSection("buildings", ["summary", "buildings", "drawing"])).toBe("buildings");
    expect(resolveRightSidebarSection("trees", ["summary", "drawing"])).toBe("summary");
    expect(resolveRightSidebarSection("drawing", ["summary", "drawing"])).toBe("summary");
  });

  it("switches left and right sections independently without turning off the other side; selecting the open section keeps it", () => {
    let state = initialSidebarState();
    state = reduceSidebar(state, { type: "select", id: "buildings" });
    expect(state).toEqual({ section: "drawing", rightSection: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "buildings" });
    expect(state).toEqual({ section: "drawing", rightSection: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "analysis" });
    expect(state).toEqual({ section: "analysis", rightSection: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "analysis" });
    expect(state).toEqual({ section: "analysis", rightSection: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "summary" });
    expect(state).toEqual({ section: "analysis", rightSection: "summary" });
  });

  it("returns to Display on the left and Model details on the right for a new model", () => {
    const state = reduceSidebar({ section: "exports", rightSection: "buildings" }, { type: "new-model" });
    expect(state).toEqual({ section: "drawing", rightSection: "summary" });
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

describe("left vs right sidebar panels", () => {
  it("splits left-hand tools (Display, Site Analysis, Import, Export) from right-hand panels (Model details, Buildings, Trees)", () => {
    expect(LEFT_SIDEBAR_SECTION_IDS).toEqual(["drawing", "analysis", "import", "exports"]);
    expect(RIGHT_SIDEBAR_SECTION_IDS).toEqual(["summary", "buildings", "trees"]);
    expect(isRightSidebarSection("summary")).toBe(true);
    expect(isRightSidebarSection("buildings")).toBe(true);
    expect(isRightSidebarSection("trees")).toBe(true);
    expect(isRightSidebarSection("drawing")).toBe(false);
    expect(isRightSidebarSection("analysis")).toBe(false);
    expect(isRightSidebarSection("import")).toBe(false);
    expect(isRightSidebarSection("exports")).toBe(false);
    expect(isLeftSidebarSection("drawing")).toBe(true);
    expect(isLeftSidebarSection("analysis")).toBe(true);
    expect(isLeftSidebarSection("import")).toBe(true);
    expect(isLeftSidebarSection("exports")).toBe(true);
    expect(isLeftSidebarSection("summary")).toBe(false);
  });
});
