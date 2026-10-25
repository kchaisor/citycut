/**
 * Fixed model sidebars: left tool panel and right info panel, each with one section
 * open at a time chosen from its horizontal top icon rail.
 *
 * A new model always opens with Display ("drawing") on the left and Model details
 * ("summary") on the right. Whether the left panel is collapsed is shared with the
 * landing page; see `sidebarCollapse.ts`.
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

export const LEFT_SIDEBAR_SECTION_IDS = ["drawing", "analysis", "import", "exports"] as const;

export type LeftSidebarSectionId = (typeof LEFT_SIDEBAR_SECTION_IDS)[number];

export const RIGHT_SIDEBAR_SECTION_IDS = ["summary", "buildings", "trees"] as const;

export type RightSidebarSectionId = (typeof RIGHT_SIDEBAR_SECTION_IDS)[number];

export const INITIAL_SIDEBAR_SECTION: LeftSidebarSectionId = "drawing";
export const INITIAL_LEFT_SIDEBAR_SECTION: LeftSidebarSectionId = "drawing";
export const INITIAL_RIGHT_SIDEBAR_SECTION: RightSidebarSectionId = "summary";

export function isRightSidebarSection(id: string | null | undefined): id is RightSidebarSectionId {
  return Boolean(id && (RIGHT_SIDEBAR_SECTION_IDS as readonly string[]).includes(id));
}

export function isLeftSidebarSection(id: string | null | undefined): id is LeftSidebarSectionId {
  return Boolean(id && (LEFT_SIDEBAR_SECTION_IDS as readonly string[]).includes(id));
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

/** Sections this model can show. All left-hand tools and all three right-hand tabs (Model details, Buildings, Trees) are always available. */
export function availableSidebarSections(_input?: { buildings?: boolean; trees?: boolean }): SidebarSectionId[] {
  return [...SIDEBAR_SECTION_IDS];
}

/** The left section to show: the chosen one when available, otherwise Display (or the first available left section). */
export function resolveLeftSidebarSection(
  chosen: string | null | undefined,
  available: readonly string[],
): LeftSidebarSectionId {
  const fallback = (): LeftSidebarSectionId => {
    if (available.includes(INITIAL_LEFT_SIDEBAR_SECTION)) return INITIAL_LEFT_SIDEBAR_SECTION;
    const first = available.find((id) => (LEFT_SIDEBAR_SECTION_IDS as readonly string[]).includes(id));
    return (first as LeftSidebarSectionId | undefined) ?? INITIAL_LEFT_SIDEBAR_SECTION;
  };
  if (chosen === "solar" || chosen === "wind" || chosen === "view") {
    return available.includes("analysis") ? "analysis" : fallback();
  }
  if (chosen && available.includes(chosen) && isLeftSidebarSection(chosen)) {
    return chosen;
  }
  return fallback();
}

/** The right section to show: the chosen one when available, otherwise Model details (or the first available right section). */
export function resolveRightSidebarSection(
  chosen: string | null | undefined,
  available: readonly string[],
): RightSidebarSectionId {
  const fallback = (): RightSidebarSectionId => {
    if (available.includes(INITIAL_RIGHT_SIDEBAR_SECTION)) return INITIAL_RIGHT_SIDEBAR_SECTION;
    const first = available.find((id) => (RIGHT_SIDEBAR_SECTION_IDS as readonly string[]).includes(id));
    return (first as RightSidebarSectionId | undefined) ?? INITIAL_RIGHT_SIDEBAR_SECTION;
  };
  if (chosen && available.includes(chosen) && isRightSidebarSection(chosen)) {
    return chosen;
  }
  return fallback();
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
 * Independent left and right section state for one model. Choosing a left section
 * updates only `section` (keeping `rightSection` active), and choosing a right
 * section updates only `rightSection` (keeping `section` active). A new model resets
 * to Display on the left and Model details on the right.
 */
export type SidebarState = {
  section: LeftSidebarSectionId;
  rightSection: RightSidebarSectionId;
};

export type SidebarAction = { type: "select"; id: SidebarSectionId } | { type: "new-model" };

export function initialSidebarState(): SidebarState {
  return {
    section: INITIAL_LEFT_SIDEBAR_SECTION,
    rightSection: INITIAL_RIGHT_SIDEBAR_SECTION,
  };
}

export function reduceSidebar(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case "select":
      if (isRightSidebarSection(action.id)) {
        return { ...state, rightSection: action.id };
      }
      return { ...state, section: action.id };
    case "new-model":
      return initialSidebarState();
  }
}
