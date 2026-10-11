/**
 * CoM 2023 measured heights have no on/off switch: they always apply where the data covers the
 * cut. This only reports state for the Buildings panel, so a failure is visible, never silent.
 *
 * - "outside": the cut is outside the City of Melbourne inventory (nothing to load).
 * - "loading": footprints or the matcher are still running; the next source shows meanwhile.
 * - "failed": the fetch or the matcher failed; heights fall back to the next source and the
 *   panel shows a note with a Retry button.
 * - "on": CoM heights are applied.
 */
export type ComBuildingHeightsStatus = "outside" | "loading" | "failed" | "on";

/** Old opt-out key. Ignored now; kept so we can drop a stale "false" from #46–#82 builds. */
export const LEGACY_COM_BUILDING_HEIGHTS_STORAGE_KEY = "citycut.comBuildingHeights";

export function comBuildingHeightsStatus(input: {
  buildingsLayer: boolean;
  inComCity: boolean;
  loading: boolean;
  loadFailed: boolean;
}): ComBuildingHeightsStatus {
  if (!input.buildingsLayer || !input.inComCity) return "outside";
  if (input.loading) return "loading";
  if (input.loadFailed) return "failed";
  return "on";
}

export function comBuildingHeightsStatusNote(status: ComBuildingHeightsStatus): string | null {
  switch (status) {
    case "loading":
      return "Loading City of Melbourne 2023 measured heights…";
    case "failed":
      return "City of Melbourne heights failed to load, so heights use the next source (development floors, Overture, or a zone default estimate).";
    default:
      return null;
  }
}

/** Remove the old opt-out flag so no browser keeps a hidden "CoM off" preference. */
export function clearLegacyComBuildingHeightsPreference(storage: { removeItem(key: string): void }): void {
  try {
    storage.removeItem(LEGACY_COM_BUILDING_HEIGHTS_STORAGE_KEY);
  } catch {
    // Private mode can reject localStorage.
  }
}
