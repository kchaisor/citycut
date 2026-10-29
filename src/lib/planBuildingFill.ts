import type { BuildingFeat, CityModel } from "../types";
import type { BuildingUse } from "../types";
import { buildingViewportFill, type BuildingColourMode } from "./buildingViewportColor";
import { getColour } from "./colours";
import { isSiteBuilding } from "./siteBuildings";

export function planBuildingFill(
  model: CityModel,
  building: BuildingFeat,
  mode: BuildingColourMode,
  highlightManual: boolean,
): string {
  // Imported massing keeps its own colour (default token) in every colour mode.
  if (building.importedMassing) return importedMassingFill(building);
  if (highlightManual && building.heightManual) return getColour("--building-manual");
  if (isSiteBuilding(model, building.id)) return getColour("--site-building");
  return buildingViewportFill(mode, building.use as BuildingUse, building.source, building);
}

/** Fill of an imported massing footprint: its per-model colour, else the `--imported-massing` token. */
export function importedMassingFill(building: Pick<BuildingFeat, "importedColour">): string {
  return building.importedColour ?? getColour("--imported-massing");
}

export function planBuildingStrokeStyle(
  style: import("./drawingStyle").LineStyles,
  uniformBuildings: boolean,
  isSite: boolean,
): import("./drawingStyle").StrokeStyle {
  if (isSite) return style.siteBuilding;
  if (uniformBuildings && !(style.building.mm > 0)) {
    return { ...style.building, mm: 0.12 };
  }
  return style.building;
}

/**
 * Imported massing outline: the building pen's colour, heavier and dashed, so a yellow imported
 * footprint reads apart from a (solid-edged) yellow site building on screen and in the .ai.
 */
export function importedMassingStrokeStyle(
  style: import("./drawingStyle").LineStyles,
): import("./drawingStyle").StrokeStyle {
  return { mm: Math.max(0.35, style.building.mm), color: style.building.color, dash: "1.2 0.6" };
}
