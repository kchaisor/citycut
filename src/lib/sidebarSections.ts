export const SIDEBAR_SECTION_IDS = ["summary", "buildings", "trees", "drawing", "analysis", "import", "exports"] as const;

export type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];

export const SITE_ANALYSIS_KINDS = ["solar", "wind", "view", "walkRipple"] as const;
export type SiteAnalysisKind = (typeof SITE_ANALYSIS_KINDS)[number];
export const SITE_ANALYSIS_LABELS: Record<SiteAnalysisKind, string> = {
  solar: "Sun",
  wind: "Wind",
  view: "View",
  walkRipple: "Walk",
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
  drawing: "Display",
  analysis: "Site Analysis",
  import: "Import",
  exports: "Export",
};

export function availableSidebarSections(_input?: { buildings?: boolean; trees?: boolean }): SidebarSectionId[] {
  return [...SIDEBAR_SECTION_IDS];
}

export function resolveLeftSidebarSection(
  chosen: string | null | undefined,
  available: readonly string[],
): LeftSidebarSectionId {
  const fallback = (): LeftSidebarSectionId => {
    if (available.includes(INITIAL_LEFT_SIDEBAR_SECTION)) return INITIAL_LEFT_SIDEBAR_SECTION;
    const first = available.find((id) => (LEFT_SIDEBAR_SECTION_IDS as readonly string[]).includes(id));
    return (first as LeftSidebarSectionId | undefined) ?? INITIAL_LEFT_SIDEBAR_SECTION;
  };
  if (chosen === "solar" || chosen === "wind" || chosen === "view" || chosen === "walkRipple") {
    return available.includes("analysis") ? "analysis" : fallback();
  }
  if (chosen && available.includes(chosen) && isLeftSidebarSection(chosen)) {
    return chosen;
  }
  return fallback();
}

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

export function resolveSidebarSection(
  chosen: string | null | undefined,
  available: readonly string[],
): SidebarSectionId {
  const fallback = (): SidebarSectionId => {
    if (available.includes(INITIAL_SIDEBAR_SECTION)) return INITIAL_SIDEBAR_SECTION;
    const first = available.find((id) => (SIDEBAR_SECTION_IDS as readonly string[]).includes(id));
    return (first as SidebarSectionId | undefined) ?? INITIAL_SIDEBAR_SECTION;
  };
  if (chosen === "solar" || chosen === "wind" || chosen === "view" || chosen === "walkRipple") {
    return available.includes("analysis") ? "analysis" : fallback();
  }
  if (chosen && available.includes(chosen) && (SIDEBAR_SECTION_IDS as readonly string[]).includes(chosen)) {
    return chosen as SidebarSectionId;
  }
  return fallback();
}

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
