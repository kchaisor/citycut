export const BUILDINGS_LEGEND_COLLAPSED_KEY = "citycut.legend.buildings.collapsed";
export const TREES_LEGEND_COLLAPSED_KEY = "citycut.legend.trees.collapsed";

export const NARROW_PANEL_QUERY = "(max-width: 640px)";

/**
 * Collapsed when a stored flag says so. With no stored flag, follow the narrow breakpoint.
 * A recognised stored value wins over `isNarrow`.
 */
export function resolvePanelCollapsed(stored: string | null, isNarrow: boolean): boolean {
  if (stored === "1" || stored === "true") return true;
  if (stored === "0" || stored === "false") return false;
  return isNarrow;
}

export function readPanelCollapsed(key: string, isNarrow: boolean): boolean {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(key);
  } catch {
    stored = null;
  }
  return resolvePanelCollapsed(stored, isNarrow);
}

export function writePanelCollapsed(key: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(key, collapsed ? "1" : "0");
  } catch {
    // Private mode and some embedded browsers throw on localStorage.
  }
}

export function viewportIsNarrow(): boolean {
  try {
    return window.matchMedia(NARROW_PANEL_QUERY).matches;
  } catch {
    return false;
  }
}
