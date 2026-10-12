import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEnrichmentManifest } from "./buildingEnrichmentTiles";
import { buildEnrichmentUseTierFailures } from "./enrichmentUseTierFailures";

/** Shape of a manifest baked before the building-permit (BCA) tier was retired. */
const OLD_MANIFEST = {
  extent: { west: 144.3, south: -38.5, east: 145.9, north: -37.2 },
  bca: { status: "blocked", detail: "BCA xlsb HTTP 403", url: "https://example.invalid/permits.xlsb" },
  useSourceCountsSample: { overture: 1, clue: 1, bca: 0, zone: 1, unclassified: 0 },
  pipelineTimingsSec: { bcaJoinSec: 2.97 },
};

afterEach(() => vi.unstubAllGlobals());

describe("buildEnrichmentUseTierFailures", () => {
  it("lists the tile failure and nothing about building permits", () => {
    const failures = buildEnrichmentUseTierFailures({
      baseFailures: [],
      enrichmentError: "HTTP 404",
      coverageMessage: null,
    });
    expect(failures.map((failure) => failure.message)).toEqual([
      "Building enrichment tiles unavailable (HTTP 404); live Vicmap zones used for use",
    ]);
  });

  it("ignores bca fields in an old manifest without error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(OLD_MANIFEST), { status: 200, headers: { "content-type": "application/json" } })),
    );
    const manifest = await fetchEnrichmentManifest();
    expect(manifest?.extent.west).toBe(144.3);
    const failures = buildEnrichmentUseTierFailures({ baseFailures: [], enrichmentError: null, coverageMessage: null });
    expect(failures).toEqual([]);
  });
});
