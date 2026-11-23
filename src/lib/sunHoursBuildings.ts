import { siteFrameFromModel } from "./modelFrame";
import { containsPoint } from "./siteFrame";
import type { BuildingFeat, CityModel } from "../types";

export function castsSunHoursShadow(building: BuildingFeat): boolean {
  return !building.importedMassingSkipShadow;
}

export function receivesSunHours(building: BuildingFeat): boolean {
  return !building.importedMassingShadowCaster;
}

export function sunHoursReceivers(
  model: Pick<CityModel, "sideM" | "widthM" | "heightM" | "frameShape" | "buildings">,
): BuildingFeat[] {
  const frame = siteFrameFromModel(model);
  return model.buildings.filter(
    (building) => receivesSunHours(building) && building.ring.some((point) => containsPoint(frame, point)),
  );
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
