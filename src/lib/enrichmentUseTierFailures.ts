import type { UseTierFailure } from "../types";

/**
 * Visible note for a building-permit (BCA) tier that did not load, from the
 * enrichment manifest's `bca.status`. `null` when permits loaded or were not tried.
 */
export function bcaFailureMessage(status: string | undefined | null): string | null {
  switch (status) {
    case "blocked":
      return "Building permit (BCA): blocked by source (403)";
    case "unjoinable":
      return "Building permit (BCA): published permits list street and suburb only, so they cannot be matched to buildings";
    case "failed":
      return "Building permit (BCA): download or parse failed";
    case "empty":
      return "Building permit (BCA): no permits matched an address";
    default:
      return null;
  }
}

/** Non-blocking use-tier legend lines for enrichment manifest / tile fetch outcomes. */
export function buildEnrichmentUseTierFailures(input: {
  baseFailures: UseTierFailure[];
  enrichmentError: string | null;
  /** `bca.status` from the enrichment manifest. */
  bcaStatus?: string | null;
  coverageMessage: string | null;
  zonesFetchIncomplete?: boolean;
}): UseTierFailure[] {
  const failures = [...input.baseFailures];
  if (input.zonesFetchIncomplete) {
    failures.push({
      id: "enrichment_zones_wfs_incomplete",
      tier: "enrichment_tiles",
      message:
        "Offline zone bake missed Vicmap WFS pages; buildings without a zone match may show as unclassified until tiles are rebuilt",
    });
  }
  if (input.enrichmentError) {
    failures.push({
      id: "enrichment_tiles_fetch",
      tier: "enrichment_tiles",
      message: `Building enrichment tiles unavailable (${input.enrichmentError}); live Vicmap zones used for use`,
    });
  }
  const bcaMessage = bcaFailureMessage(input.bcaStatus);
  if (bcaMessage) {
    failures.push({ id: "enrichment_bca_blocked", tier: "enrichment_tiles", message: bcaMessage });
  }
  if (input.coverageMessage) {
    failures.push({
      id: "enrichment_coverage",
      tier: "enrichment_coverage",
      message: input.coverageMessage,
    });
  }
  return failures;
}
