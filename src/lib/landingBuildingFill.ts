import type { BuildingFeat } from "../types";
import type { BuildingUse } from "../types";
import { BUILDING_USE_META } from "./buildingUse";
import { getColour } from "./colours";

/** Landing-map fills: colour by use, neutral token when still unclassified. */
export function landingBuildingFill(building: BuildingFeat): string {
  const use = building.use as BuildingUse | undefined;
  if (use && use !== "unclassified") return BUILDING_USE_META[use].color;
  return getColour("--building-uniform");
}
