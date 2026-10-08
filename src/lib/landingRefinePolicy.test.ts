import { describe, expect, it } from "vitest";
import type { BuildingFeat } from "../types";
import type { EnrichmentManifest } from "./buildingEnrichmentTiles";
import {
  cutBoundsInsideBuiltBbox,
  mergedNeedsLiveZoneRefine,
  shouldRunLiveZoneRefine,
} from "./landingRefinePolicy";

const gmManifest: EnrichmentManifest = {
  extent: { west: 144.33, south: -38.5, east: 145.88, north: -37.18 },
  builtBbox: { west: 144.33, south: -38.5, east: 145.88, north: -37.18 },
  featureCount: 1,
  pmtilesBytes: 1,
  generatedAt: "2026-01-01T00:00:00Z",
};

const hawthornBounds = { west: 145.02, south: -37.83, east: 145.05, north: -37.81 };

describe("landingRefinePolicy", () => {
  it("detects a cut fully inside built bbox", () => {
    expect(cutBoundsInsideBuiltBbox(hawthornBounds, gmManifest)).toBe(true);
  });

  it("skips live refine inside coverage when every footprint has a tile row", () => {
    const merged: BuildingFeat[] = [
      {
        id: 1,
        overtureId: "a",
        ring: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
        holes: [],
        height: 9,
        use: "residential",
        source: "zone",
        useSourceTier: "zone",
      },
    ];
    const byId = new Map([
      [
        "a",
        {
          overtureId: "a",
          use: "residential" as const,
          useSource: "zone" as const,
          heightM: null,
          heightSource: null,
          zoneCode: "GRZ",
        },
      ],
    ]);
    expect(mergedNeedsLiveZoneRefine(merged, byId)).toBe(false);
    expect(
      shouldRunLiveZoneRefine({
        tilesOnly: false,
        forceLiveRefine: false,
        enrichmentError: null,
        manifestMatchesAppTables: true,
        manifest: gmManifest,
        cutBounds: hawthornBounds,
        merged,
        byId,
      }),
    ).toBe(false);
  });

  it("runs live refine when a footprint is missing from tiles", () => {
    const merged: BuildingFeat[] = [
      {
        id: 1,
        overtureId: "missing",
        ring: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
        holes: [],
        height: 9,
        use: "unclassified",
        source: "none",
      },
    ];
    expect(mergedNeedsLiveZoneRefine(merged, new Map())).toBe(true);
  });
});
