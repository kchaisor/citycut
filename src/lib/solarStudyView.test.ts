import { describe, expect, it } from "vitest";
import {
  SIDEBAR_SECTION_IDS,
  SITE_ANALYSIS_KINDS,
  initialSidebarState,
  resolveLeftSidebarSection,
} from "./sidebarSections";
import { solarStudyViewActive } from "./solarStudyView";

describe("solarStudyViewActive", () => {
  it("stays off on the default Display sidebar even though analysisKind defaults to solar", () => {
    const leftOpen = resolveLeftSidebarSection(initialSidebarState().section, SIDEBAR_SECTION_IDS);
    expect(leftOpen).toBe("drawing");
    expect(solarStudyViewActive(leftOpen, "solar")).toBe(false);
  });

  it("is on only while Site Analysis is open on Solar Study", () => {
    expect(solarStudyViewActive("analysis", "solar")).toBe(true);
  });

  it("is off for every other Site Analysis tab", () => {
    for (const kind of SITE_ANALYSIS_KINDS.filter((kind) => kind !== "solar")) {
      expect(solarStudyViewActive("analysis", kind)).toBe(false);
    }
  });

  it("is off in Import and Export with Solar Study selected", () => {
    expect(solarStudyViewActive("import", "solar")).toBe(false);
    expect(solarStudyViewActive("exports", "solar")).toBe(false);
  });
});
