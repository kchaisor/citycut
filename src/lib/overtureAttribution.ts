import { DATA_CREDIT_BASE } from "./dataCredits";

/** Roads, water, green, buildings, and trees sourced from Overture PMTiles. */
export function overtureThemeCredit(_options?: {
  hasMicrosoftFootprints?: boolean;
  hasEsaLandCover?: boolean;
}): string {
  return DATA_CREDIT_BASE;
}
