import type { UseTierFailure } from "../types";

/** Non-blocking use-tier legend lines for enrichment manifest / tile fetch outcomes. */
export function buildEnrichmentUseTierFailures(input: {
  baseFailures: UseTierFailure[];
  enrichmentError: string | null;
  bcaBlocked: boolean;
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
  if (input.bcaBlocked) {
    failures.push({
      id: "enrichment_bca_blocked",
      tier: "enrichment_tiles",
      message: "Building permit (BCA): blocked by source (403)",
    });
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
