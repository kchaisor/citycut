import { describe, expect, it } from "vitest";
import {
  cutCenterOutsideBuiltBbox,
  enrichmentCoverageMessage,
} from "./enrichmentCoverage";
import type { EnrichmentManifest } from "./buildingEnrichmentTiles";

const gmManifest: EnrichmentManifest = {
  extent: { west: 144.33, south: -38.5, east: 145.88, north: -37.18 },
  builtBbox: { west: 144.33, south: -38.5, east: 145.88, north: -37.18 },
  regionName: "Greater Melbourne (ABS ASGS 2021 GCCSA 2GMEL)",
  featureCount: 1,
  pmtilesBytes: 1,
  generatedAt: "2026-01-01T00:00:00Z",
};

const comFallback: EnrichmentManifest = {
  ...gmManifest,
  builtBbox: { west: 144.89, south: -37.86, east: 145, north: -37.77 },
  regionName: undefined,
};

describe("enrichmentCoverage", () => {
  it("Hawthorn is inside Greater Melbourne built bbox", () => {
    expect(
      cutCenterOutsideBuiltBbox({ lat: -37.8226, lon: 145.0354 }, gmManifest),
    ).toBe(false);
  });

  it("Hawthorn is outside committed CoM fallback bbox", () => {
    expect(
      cutCenterOutsideBuiltBbox({ lat: -37.8226, lon: 145.0354 }, comFallback),
    ).toBe(true);
  });

  it("mentions region name when present", () => {
    const msg = enrichmentCoverageMessage(comFallback);
    expect(msg).toMatch(/City of Melbourne|144\.89/);
  });
});
