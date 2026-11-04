import type { KeyValueStore } from "./view3dDisplay";

export const VIEW3D_BUILDING_COLOUR_KEY = "citycut.view3d.buildingColour";
export const VIEW3D_WHITE_CARD_LEGACY_KEY = "citycut.view3d.whiteCard";

export type BuildingColourStyle = "use" | "source" | "uniform";

export const DEFAULT_BUILDING_COLOUR_STYLE: BuildingColourStyle = "uniform";

function readLegacyWhiteCard(storage: KeyValueStore): boolean {
  try {
    return storage.getItem(VIEW3D_WHITE_CARD_LEGACY_KEY) === "1";
  } catch {
    return false;
  }
}

export function readStoredBuildingColourStyle(storage: KeyValueStore): BuildingColourStyle {
  if (readLegacyWhiteCard(storage)) return "uniform";
  try {
    const raw = storage.getItem(VIEW3D_BUILDING_COLOUR_KEY);
    if (raw === "use" || raw === "source" || raw === "uniform") return raw;
  } catch {
  }
  return DEFAULT_BUILDING_COLOUR_STYLE;
}

export function writeStoredBuildingColourStyle(storage: KeyValueStore, style: BuildingColourStyle): void {
  try {
    storage.setItem(VIEW3D_BUILDING_COLOUR_KEY, style);
    if (storage.removeItem) storage.removeItem(VIEW3D_WHITE_CARD_LEGACY_KEY);
  } catch {
  }
}

export function buildingColourStyleToFlags(style: BuildingColourStyle): {
  colourByUse: boolean;
  showSource: boolean;
} {
  if (style === "use") return { colourByUse: true, showSource: false };
  if (style === "source") return { colourByUse: false, showSource: true };
  return { colourByUse: false, showSource: false };
}

export function flagsToBuildingColourStyle(colourByUse: boolean, showSource: boolean): BuildingColourStyle {
  if (showSource) return "source";
  if (colourByUse) return "use";
  return "uniform";
}
