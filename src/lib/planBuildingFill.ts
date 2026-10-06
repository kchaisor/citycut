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
  if (highlightManual && building.heightManual) return getColour("--building-manual");
  if (isSiteBuilding(model, building.id)) return getColour("--site-building");
  return buildingViewportFill(mode, building.use as BuildingUse, building.source);
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
