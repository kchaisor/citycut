import { DATA_CREDIT_BASE } from "./dataCredits";

export const OVERTURE_BUILDING_ATTRIBUTION = DATA_CREDIT_BASE;

/** @deprecated Use plainDataCredit from dataCredits.ts. Kept for callers that pass hasMicrosoftFootprints. */
export function buildingDataCredit(_hasMicrosoftFootprints?: boolean): string {
  return DATA_CREDIT_BASE;
}
