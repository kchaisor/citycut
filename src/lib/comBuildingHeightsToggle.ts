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
