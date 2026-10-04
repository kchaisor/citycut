export const OVERTURE_BUILDING_ATTRIBUTION =
  "© OpenStreetMap contributors, Overture Maps Foundation (ODbL)";

export const MICROSOFT_ML_ATTRIBUTION =
  "includes Microsoft Global ML Building Footprints (ODbL)";

/** Footer, .ai, and Rhino building credit. Microsoft clause when ML footprints appear in the frame. */
export function buildingDataCredit(hasMicrosoftFootprints: boolean): string {
  if (hasMicrosoftFootprints) {
    return `${OVERTURE_BUILDING_ATTRIBUTION}; ${MICROSOFT_ML_ATTRIBUTION}`;
  }
  return OVERTURE_BUILDING_ATTRIBUTION;
}
