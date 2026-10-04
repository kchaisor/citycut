import { buildingDataCredit } from "./buildingAttribution";

export const ESA_WORLDCOVER_ATTRIBUTION =
  "Land cover © ESA WorldCover (CC BY 4.0) via Overture Maps";

/** Roads, water, green, buildings, and trees sourced from Overture PMTiles. */
export function overtureThemeCredit(options: {
  hasMicrosoftFootprints?: boolean;
  hasEsaLandCover?: boolean;
}): string {
  const parts = [buildingDataCredit(Boolean(options.hasMicrosoftFootprints))];
  if (options.hasEsaLandCover) parts.push(ESA_WORLDCOVER_ATTRIBUTION);
  return parts.join("; ");
}
