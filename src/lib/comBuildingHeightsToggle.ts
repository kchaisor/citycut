export const COM_BUILDING_HEIGHTS_STORAGE_KEY = "citycut.comBuildingHeights";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** CoM 2023 heights are on by default; localStorage `"false"` opts out for this browser. */
export function readStoredComBuildingHeights(storage: KeyValueStore): boolean {
  try {
    const raw = storage.getItem(COM_BUILDING_HEIGHTS_STORAGE_KEY);
    if (raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function writeStoredComBuildingHeights(storage: KeyValueStore, enabled: boolean): void {
  try {
    storage.setItem(COM_BUILDING_HEIGHTS_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Private mode can reject localStorage.
  }
}

export type ComBuildingHeightsToggleKind = "off" | "on" | "loading" | "failed";

export function comBuildingHeightsToggleKind(input: {
  userEnabled: boolean;
  inComCity: boolean;
  loadFailed: boolean;
  loading: boolean;
}): ComBuildingHeightsToggleKind {
  if (!input.userEnabled || !input.inComCity) return "off";
  if (input.loading) return "loading";
  if (input.loadFailed) return "failed";
  return "on";
}

export function comBuildingHeightsToggleLabel(kind: ComBuildingHeightsToggleKind): string {
  switch (kind) {
    case "off":
      return "CoM 2023 heights off · turn on";
    case "on":
      return "CoM 2023 measured heights on · turn off";
    case "loading":
      return "CoM 2023 heights: loading…";
    case "failed":
      return "CoM 2023 heights: failed to load";
  }
}

export function comBuildingHeightsTogglePressed(kind: ComBuildingHeightsToggleKind): boolean {
  return kind === "on";
}
