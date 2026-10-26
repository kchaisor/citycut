import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearEnrichmentPmtilesCache,
  fetchEnrichmentManifest,
  getEnrichmentPmtilesAbsoluteUrl,
  PAGES_ENRICHMENT_MANIFEST_URL,
  PAGES_ENRICHMENT_PMTILES_URL,
} from "./buildingEnrichmentTiles";
import { buildEnrichmentUseTierFailures } from "./enrichmentUseTierFailures";

/** Shape of a manifest baked before the building-permit (BCA) tier was retired. */
const OLD_MANIFEST = {
  extent: { west: 144.3, south: -38.5, east: 145.9, north: -37.2 },
  bca: { status: "blocked", detail: "BCA xlsb HTTP 403", url: "https://example.invalid/permits.xlsb" },
  useSourceCountsSample: { overture: 1, clue: 1, bca: 0, zone: 1, unclassified: 0 },
  pipelineTimingsSec: { bcaJoinSec: 2.97 },
};

afterEach(() => {
  clearEnrichmentPmtilesCache();
  vi.unstubAllGlobals();
});

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

  it("upgrades committed City of Melbourne fallback manifest to Greater Melbourne GitHub Pages PMTiles when reachable", async () => {
    const committedFallback = {
      regionName: "City of Melbourne (committed fallback tiles)",
      extent: { west: 144.89, south: -37.86, east: 145.0, north: -37.77 },
      overtureRelease: "2026-03-18.0",
    };
    const pagesFull = {
      regionName: "Greater Melbourne (ABS ASGS 2021 GCCSA 2GMEL)",
      extent: { west: 144.333634, south: -38.502988, east: 145.878412, north: -37.175099 },
      overtureRelease: "2026-09-23.1",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.referrerPolicy).toBe("no-referrer");
        if (String(input) === PAGES_ENRICHMENT_MANIFEST_URL) {
          return new Response(JSON.stringify(pagesFull), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(committedFallback), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const absoluteUrl = await getEnrichmentPmtilesAbsoluteUrl();
    expect(absoluteUrl).toBe(PAGES_ENRICHMENT_PMTILES_URL);
  });
});
