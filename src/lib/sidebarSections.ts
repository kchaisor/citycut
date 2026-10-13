/**
 * Fixed model sidebar: one section open at a time, chosen from the icon rail.
 *
 * A new model always opens on Model details. The section is not restored from
 * storage (the old floating drawer remembered it in `citycut.rail.model`). Whether
 * the panel is collapsed is shared with the landing page; see `sidebarCollapse.ts`.
 */
export const SIDEBAR_SECTION_IDS = ["summary", "buildings", "trees", "drawing", "solar", "wind", "import", "exports"] as const;

export type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];

export const INITIAL_SIDEBAR_SECTION: SidebarSectionId = "summary";

export const SIDEBAR_SECTION_LABELS: Record<SidebarSectionId, string> = {
  summary: "Model details",
  buildings: "Buildings",
  trees: "Trees",
  drawing: "Drawing",
  solar: "Sun",
  wind: "Wind",
  import: "Import",
  exports: "Export",
};

/** Sections this model can show. Buildings and Trees only appear when the model has them. */
export function availableSidebarSections(input: { buildings: boolean; trees: boolean }): SidebarSectionId[] {
  return SIDEBAR_SECTION_IDS.filter(
    (id) => (id !== "buildings" || input.buildings) && (id !== "trees" || input.trees),
  );
}

/** The section to show: the chosen one when this model has it, otherwise Model details. */
export function resolveSidebarSection(
  chosen: string | null | undefined,
  available: readonly string[],
): SidebarSectionId {
  if (chosen && available.includes(chosen) && (SIDEBAR_SECTION_IDS as readonly string[]).includes(chosen)) {
    return chosen as SidebarSectionId;
  }
  return INITIAL_SIDEBAR_SECTION;
}

/**
 * Section state for one model. Choosing a section never closes the panel (the
 * rail does not toggle); only the collapse button does. A new model resets to
 * Model details.
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
