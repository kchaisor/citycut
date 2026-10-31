import { manualHeightCreditFragment } from "./heightOverrides";
import type { CityModel } from "../types";

export const COM_BUILDING_HEIGHTS_DATASET_URL =
  "https://data.melbourne.vic.gov.au/explore/dataset/2023-building-footprints/";

export function showComBuildingHeightFooterCredit(comBuildingHeights: boolean): boolean {
  return comBuildingHeights;
}

export const COM_BUILDING_HEIGHTS_CREDIT =
  "Building heights: 2023 Building Footprints © City of Melbourne, CC BY 4.0";

export function comBuildingHeightsActive(model: CityModel): boolean {
  return Boolean(model.comBuildingHeights);
}

export function comBuildingHeightCreditLine(model: CityModel): string | null {
  const manual = manualHeightCreditFragment(model.manualHeightEditCount ?? 0);
  if (!comBuildingHeightsActive(model)) {
    if (!manual) return null;
    return manual.charAt(0).toUpperCase() + manual.slice(1);
  }
  if (!manual) return COM_BUILDING_HEIGHTS_CREDIT;
  return `${COM_BUILDING_HEIGHTS_CREDIT}; ${manual}.`;
}
