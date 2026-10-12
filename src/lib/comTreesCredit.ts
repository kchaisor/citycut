import { treeTierCounts } from "./trees";
import type { CityModel } from "../types";

/**
 * City of Melbourne open-data page for the urban forest inventory used by comTrees.ts.
 * Title and licence as published there: "Trees, with species and dimensions (Urban Forest)", CC BY
 * (licence URL creativecommons.org/licenses/by/4.0).
 */
export const COM_TREES_DATASET_URL =
  "https://data.melbourne.vic.gov.au/explore/dataset/trees-with-species-and-dimensions-urban-forest/";

/** Plain-text credit for the Trees panel, source notes, PDF/.ai and Rhino metadata. */
export const COM_TREES_CREDIT =
  "Trees: Trees, with species and dimensions (Urban Forest) © City of Melbourne, CC BY 4.0";

/** True when at least one tree in the cut came from the City of Melbourne inventory. */
export function comTreesInCut(model: Pick<CityModel, "trees">): boolean {
  return treeTierCounts(model.trees ?? []).com > 0;
}

/** Export credit line, or null when the cut has no CoM trees. */
export function comTreesCreditLine(model: Pick<CityModel, "trees">): string | null {
  return comTreesInCut(model) ? COM_TREES_CREDIT : null;
}

/** Linked footer credit (dataset title and licence each link out, in a new tab, like #83). */
export const COM_TREES_CREDIT_HTML =
  `Trees: <a href="${COM_TREES_DATASET_URL}" target="_blank" rel="noopener noreferrer">Trees, with species and dimensions (Urban Forest) © City of Melbourne</a>, ` +
  `<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.`;
