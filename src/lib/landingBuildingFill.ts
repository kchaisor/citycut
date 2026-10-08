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

/** Fill colour for a baked enrichment tile `use` property (matches `buildingUseFillColorExpression`). */
export function fillForTileUse(use: string | undefined): string {
  if (use && use in BUILDING_USE_META) {
    return BUILDING_USE_META[use as BuildingUse].color;
  }
  return getColour("--building-uniform");
}
