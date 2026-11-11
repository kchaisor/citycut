export type ComBuildingHeightsStatus = "outside" | "loading" | "failed" | "on";

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

export function clearLegacyComBuildingHeightsPreference(storage: { removeItem(key: string): void }): void {
  try {
    storage.removeItem(LEGACY_COM_BUILDING_HEIGHTS_STORAGE_KEY);
  } catch {
  }
}
