import { describe, expect, it } from "vitest";
import {
  INITIAL_LEFT_SIDEBAR_SECTION,
  INITIAL_RIGHT_SIDEBAR_SECTION,
  INITIAL_SIDEBAR_SECTION,
  LEFT_SIDEBAR_SECTION_IDS,
  RIGHT_SIDEBAR_SECTION_IDS,
  SIDEBAR_SECTION_LABELS,
  SITE_ANALYSIS_KINDS,
  availableSidebarSections,
  initialSidebarState,
  isLeftSidebarSection,
  isRightSidebarSection,
  reduceSidebar,
  resolveLeftSidebarSection,
  resolveRightSidebarSection,
  resolveSidebarSection,
  toggleAnalysis,
  NO_ANALYSES,
  activeAnalysisKinds,
  analysesOf,
  withAnalysisOn,
} from "./sidebarSections";

describe("sidebar sections", () => {
  it("opens with Display on the left and Model details on the right by default", () => {
    expect(INITIAL_SIDEBAR_SECTION).toBe("drawing");
    expect(INITIAL_LEFT_SIDEBAR_SECTION).toBe("drawing");
    expect(INITIAL_RIGHT_SIDEBAR_SECTION).toBe("summary");
    expect(initialSidebarState()).toEqual({ section: "drawing", rightSection: "summary" });
  });

  it("always lists all three right-hand tabs (Model details, Buildings, Trees) with no left-rail Site Analysis item, even when buildings or trees are empty", () => {
    expect(availableSidebarSections({ buildings: true, trees: false })).toEqual([
      "summary",
      "buildings",
      "trees",
      "drawing",
      "import",
      "views",
      "exports",
    ]);
    expect(availableSidebarSections({ buildings: false, trees: false })).toEqual([
      "summary",
      "buildings",
      "trees",
      "drawing",
      "import",
      "views",
      "exports",
    ]);
    expect(availableSidebarSections({ buildings: false, trees: true })).toContain("trees");
    expect(Object.values(SIDEBAR_SECTION_LABELS)).not.toContain("Site Analysis");
    expect(SITE_ANALYSIS_KINDS).toEqual(["solar", "wind", "view"]);
  });

  it("falls back to Display on the left and Model details on the right when a section is not available", () => {
    expect(resolveSidebarSection("trees", ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection("drawing", ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection("solar", ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection(null, ["summary", "drawing"])).toBe("drawing");
    expect(resolveSidebarSection(null, ["summary"])).toBe("summary");

    expect(resolveLeftSidebarSection("analysis", ["summary", "drawing", "import"])).toBe("drawing");
    expect(resolveLeftSidebarSection("solar", ["summary", "drawing", "import"])).toBe("drawing");
    expect(resolveLeftSidebarSection("buildings", ["summary", "drawing", "import"])).toBe("drawing");
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
    state = reduceSidebar(state, { type: "select", id: "import" });
    expect(state).toEqual({ section: "import", rightSection: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "import" });
    expect(state).toEqual({ section: "import", rightSection: "buildings" });
    state = reduceSidebar(state, { type: "select", id: "summary" });
    expect(state).toEqual({ section: "import", rightSection: "summary" });
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
  it("splits left-hand tools (Display, Import, Export) from right-hand panels (Model details, Buildings, Trees)", () => {
    expect(LEFT_SIDEBAR_SECTION_IDS).toEqual(["drawing", "import", "views", "exports"]);
    expect(RIGHT_SIDEBAR_SECTION_IDS).toEqual(["summary", "buildings", "trees"]);
    expect(isRightSidebarSection("summary")).toBe(true);
    expect(isRightSidebarSection("buildings")).toBe(true);
    expect(isRightSidebarSection("trees")).toBe(true);
    expect(isRightSidebarSection("drawing")).toBe(false);
    expect(isRightSidebarSection("import")).toBe(false);
    expect(isRightSidebarSection("exports")).toBe(false);
    expect(isLeftSidebarSection("drawing")).toBe(true);
    expect(isLeftSidebarSection("analysis")).toBe(false);
    expect(isLeftSidebarSection("import")).toBe(true);
    expect(isLeftSidebarSection("views")).toBe(true);
    expect(isRightSidebarSection("views")).toBe(false);
    expect(SIDEBAR_SECTION_LABELS.views).toBe("Views");
    expect(isLeftSidebarSection("exports")).toBe(true);
    expect(isLeftSidebarSection("summary")).toBe(false);
  });
});

describe("analysis toggles", () => {
  it("turns each analysis on and off on its own, without touching the others", () => {
    const solar = toggleAnalysis(NO_ANALYSES, "solar");
    expect(solar).toEqual({ solar: true, wind: false, view: false });
    const solarWind = toggleAnalysis(solar, "wind");
    expect(solarWind).toEqual({ solar: true, wind: true, view: false });
    expect(toggleAnalysis(solarWind, "view")).toEqual({ solar: true, wind: true, view: true });
    expect(toggleAnalysis(solarWind, "solar")).toEqual({ solar: false, wind: true, view: false });
    expect(toggleAnalysis(toggleAnalysis(solarWind, "solar"), "wind")).toEqual(NO_ANALYSES);
    expect(NO_ANALYSES).toEqual({ solar: false, wind: false, view: false });
  });

  it("lists what is on in bar order and turns one on without turning it off again", () => {
    expect(activeAnalysisKinds(NO_ANALYSES)).toEqual([]);
    expect(activeAnalysisKinds(analysesOf("view", "solar"))).toEqual(["solar", "view"]);
    const wind = analysesOf("wind");
    expect(withAnalysisOn(wind, "wind")).toBe(wind);
    expect(withAnalysisOn(wind, "solar")).toEqual({ solar: true, wind: true, view: false });
  });
});
