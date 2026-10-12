import { describe, expect, it } from "vitest";
import { bcaFailureMessage, buildEnrichmentUseTierFailures } from "./enrichmentUseTierFailures";

describe("buildEnrichmentUseTierFailures", () => {
  it("keeps distinct ids when tile fetch and BCA blocked both apply", () => {
    const failures = buildEnrichmentUseTierFailures({
      baseFailures: [],
      enrichmentError: "HTTP 404",
      bcaStatus: "blocked",
      coverageMessage: null,
    });
    expect(failures).toHaveLength(2);
    const ids = failures.map((failure) => failure.id);
    expect(new Set(ids).size).toBe(2);
    expect(failures.map((failure) => failure.message)).toEqual([
      "Building enrichment tiles unavailable (HTTP 404); live Vicmap zones used for use",
      "Building permit (BCA): blocked by source (403)",
    ]);
  });

  it("keeps every non-loaded BCA status visible and hides loaded ones", () => {
    for (const status of ["blocked", "unjoinable", "failed", "empty"]) {
      const failures = buildEnrichmentUseTierFailures({ baseFailures: [], enrichmentError: null, bcaStatus: status, coverageMessage: null });
      expect(failures.map((f) => f.id)).toEqual(["enrichment_bca_blocked"]);
      expect(failures[0]!.message).toBe(bcaFailureMessage(status));
    }
    expect(bcaFailureMessage("unjoinable")).toContain("cannot be matched to buildings");
    for (const status of ["loaded", "not_attempted", undefined]) {
      expect(buildEnrichmentUseTierFailures({ baseFailures: [], enrichmentError: null, bcaStatus: status, coverageMessage: null })).toEqual([]);
    }
  });
});
