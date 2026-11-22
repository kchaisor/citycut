import type { BuildingFeat, CityModel } from "../types";

export function castsSunHoursShadow(building: BuildingFeat): boolean {
  return !building.importedMassingSkipShadow;
}

export function receivesSunHours(building: BuildingFeat): boolean {
  return !building.importedMassingShadowCaster;
}

export function sunHoursModel(
  onDrawingTab: boolean,
  displayModel: CityModel,
  drawingModel: CityModel,
  importedBuildings: BuildingFeat[],
): CityModel {
  if (onDrawingTab) return drawingModel;
  if (importedBuildings.length === 0) return displayModel;
  return { ...displayModel, buildings: [...displayModel.buildings, ...importedBuildings] };
}
