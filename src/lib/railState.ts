import {
  BUILDINGS_LEGEND_COLLAPSED_KEY,
  resolvePanelCollapsed,
  TREES_LEGEND_COLLAPSED_KEY,
  viewportIsNarrow,
} from "./panelCollapse";

/** Which model drawer is open. `none` means the rail is collapsed. */
export const MODEL_DRAWER_KEY = "citycut.rail.model";

export const MODEL_DRAWER_IDS = ["summary", "buildings", "trees", "drawing", "exports"] as const;

export type ModelDrawerId = (typeof MODEL_DRAWER_IDS)[number];

export type RailAction<T extends string> =
  | { type: "toggle"; id: T }
  | { type: "escape" }
  | { type: "close" };

/**
 * One drawer at a time.
 * Toggling the open id collapses the rail. Any other id replaces it.
 * Escape and close always collapse.
 */
export function reduceRail<T extends string>(current: T | null, action: RailAction<T>): T | null {
  if (action.type === "toggle") return current === action.id ? null : action.id;
  return null;
}

export function serializeDrawer(id: string | null): string {
  return id ?? "none";
}

export type DrawerMemory = {
  stored: string | null;
  buildingsCollapsed: string | null;
  treesCollapsed: string | null;
  isNarrow: boolean;
};

function isModelDrawer(value: string): value is ModelDrawerId {
  return (MODEL_DRAWER_IDS as readonly string[]).includes(value);
}

/**
 * Restores the model rail.
 * A stored rail id wins, and `none` stays collapsed on every width.
 * With no rail value yet, an expanded legacy legend opens that drawer
 * (buildings before trees). The old narrow/wide default still applies
 * when nothing has been stored: Buildings on a wide screen, nothing on a narrow one.
 */
export function resolveModelDrawer(memory: DrawerMemory): ModelDrawerId | null {
  const { stored, isNarrow } = memory;
  if (stored !== null) {
    if (stored === "none" || stored === "") return null;
    if (isModelDrawer(stored)) return stored;
    return isNarrow ? null : "buildings";
  }
  if (!resolvePanelCollapsed(memory.buildingsCollapsed, isNarrow)) return "buildings";
  if (!resolvePanelCollapsed(memory.treesCollapsed, isNarrow)) return "trees";
  return null;
}

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function readModelDrawer(storage: KeyValueStore, isNarrow: boolean): ModelDrawerId | null {
  let stored: string | null = null;
  let buildingsCollapsed: string | null = null;
  let treesCollapsed: string | null = null;
  try {
    stored = storage.getItem(MODEL_DRAWER_KEY);
    buildingsCollapsed = storage.getItem(BUILDINGS_LEGEND_COLLAPSED_KEY);
    treesCollapsed = storage.getItem(TREES_LEGEND_COLLAPSED_KEY);
  } catch {
    return isNarrow ? null : "buildings";
  }
  return resolveModelDrawer({ stored, buildingsCollapsed, treesCollapsed, isNarrow });
}

export function writeModelDrawer(storage: KeyValueStore, id: string | null): void {
  try {
    storage.setItem(MODEL_DRAWER_KEY, serializeDrawer(id));
  } catch {
    // Private mode and some embedded browsers throw on localStorage.
  }
}

export function loadModelDrawer(): ModelDrawerId | null {
  return readModelDrawer(window.localStorage, viewportIsNarrow());
}

export function saveModelDrawer(id: string | null): void {
  writeModelDrawer(window.localStorage, id);
}

/** Hides a restored drawer when this model has nothing to show for it. */
export function drawerIsAvailable(id: string | null, available: readonly string[]): string | null {
  if (id && available.includes(id)) return id;
  return null;
}
