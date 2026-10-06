import { manualHeightCreditFragment } from "./heightOverrides";
import type { CityModel } from "../types";

/** Dataset page linked from the 3D footer and export credits. */
export const COM_BUILDING_HEIGHTS_DATASET_URL =
  "https://data.melbourne.vic.gov.au/explore/dataset/2023-building-footprints/";

/** When true, the 3D map footer should show {@link COM_BUILDING_HEIGHTS_DATASET_URL}. */
export function showComBuildingHeightFooterCredit(comBuildingHeights: boolean): boolean {
  return comBuildingHeights;
}

/** Plain-text credit for PDF, AI8, and Rhino metadata. */
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
