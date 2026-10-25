/**
 * Fixed model sidebar: one section open at a time, chosen from the icon rail.
 *
 * A new model always opens on Display ("drawing"). The section is not restored from
 * storage (the old floating drawer remembered it in `citycut.rail.model`). Whether
 * the panel is collapsed is shared with the landing page; see `sidebarCollapse.ts`.
 */
export const SIDEBAR_SECTION_IDS = ["summary", "buildings", "trees", "drawing", "analysis", "import", "exports"] as const;

export type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];

/** Sub-tabs inside the Site Analysis section (Sun, Wind, View). */
export const SITE_ANALYSIS_KINDS = ["solar", "wind", "view"] as const;
export type SiteAnalysisKind = (typeof SITE_ANALYSIS_KINDS)[number];
export const SITE_ANALYSIS_LABELS: Record<SiteAnalysisKind, string> = {
  solar: "Sun",
  wind: "Wind",
  view: "View",
};

export const INITIAL_SIDEBAR_SECTION: SidebarSectionId = "drawing";

export const LEFT_SIDEBAR_SECTION_IDS = ["drawing", "analysis", "import", "exports"] as const;

export type LeftSidebarSectionId = (typeof LEFT_SIDEBAR_SECTION_IDS)[number];

export const RIGHT_SIDEBAR_SECTION_IDS = ["summary", "buildings", "trees"] as const;

export type RightSidebarSectionId = (typeof RIGHT_SIDEBAR_SECTION_IDS)[number];

export function isRightSidebarSection(id: string | null | undefined): id is RightSidebarSectionId {
  return Boolean(id && (RIGHT_SIDEBAR_SECTION_IDS as readonly string[]).includes(id));
}

export const SIDEBAR_SECTION_LABELS: Record<SidebarSectionId, string> = {
  summary: "Model details",
  buildings: "Buildings",
  trees: "Trees",
  /** Covers 3D model, Drawing (site plan, figure-ground, exploded axo) and Satellite, so not "Drawing". */
  drawing: "Display",
  analysis: "Site Analysis",
  import: "Import",
  exports: "Export",
};

/** Sections this model can show. Buildings and Trees only appear when the model has them. */
export function availableSidebarSections(input: { buildings: boolean; trees: boolean }): SidebarSectionId[] {
  return SIDEBAR_SECTION_IDS.filter(
    (id) => (id !== "buildings" || input.buildings) && (id !== "trees" || input.trees),
  );
}

/** The section to show: the chosen one when this model has it, otherwise Display (or the first available section). */
export function resolveSidebarSection(
  chosen: string | null | undefined,
  available: readonly string[],
): SidebarSectionId {
  const fallback = (): SidebarSectionId => {
    if (available.includes(INITIAL_SIDEBAR_SECTION)) return INITIAL_SIDEBAR_SECTION;
    const first = available.find((id) => (SIDEBAR_SECTION_IDS as readonly string[]).includes(id));
    return (first as SidebarSectionId | undefined) ?? INITIAL_SIDEBAR_SECTION;
  };
  if (chosen === "solar" || chosen === "wind" || chosen === "view") {
    return available.includes("analysis") ? "analysis" : fallback();
  }
  if (chosen && available.includes(chosen) && (SIDEBAR_SECTION_IDS as readonly string[]).includes(chosen)) {
    return chosen as SidebarSectionId;
  }
  return fallback();
}

/**
 * Section state for one model. Choosing a section never closes the panel (the
 * rail does not toggle); only the collapse button does. A new model resets to
 * Display.
 */
export type SidebarState = { section: SidebarSectionId };

export type SidebarAction = { type: "select"; id: SidebarSectionId } | { type: "new-model" };

export function initialSidebarState(): SidebarState {
  return { section: INITIAL_SIDEBAR_SECTION };
}

export function reduceSidebar(_state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case "select":
      return { section: action.id };
    case "new-model":
      return initialSidebarState();
  }
}
