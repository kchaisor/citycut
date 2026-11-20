import type { LeftSidebarSectionId, SiteAnalysisKind } from "./sidebarSections";

export function solarStudyViewActive(leftOpen: LeftSidebarSectionId, analysisKind: SiteAnalysisKind): boolean {
  return leftOpen === "analysis" && analysisKind === "solar";
}
