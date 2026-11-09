import type { BuildingFeat } from "../types";

export function drawingModelBuildings(
  displayBuildings: BuildingFeat[],
  importedDrawingBuildings: BuildingFeat[],
  buildingsLayerVisible: boolean,
): BuildingFeat[] {
  if (buildingsLayerVisible) return [...displayBuildings, ...importedDrawingBuildings];
  return [...importedDrawingBuildings];
}
