import { describe, expect, it } from "vitest";
import { buildEnrichmentUseTierFailures } from "./enrichmentUseTierFailures";

describe("buildEnrichmentUseTierFailures", () => {
  it("keeps distinct ids when tile fetch and BCA blocked both apply", () => {
    const failures = buildEnrichmentUseTierFailures({
      baseFailures: [],
      enrichmentError: "HTTP 404",
      bcaBlocked: true,
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
});
