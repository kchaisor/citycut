import { beforeEach, describe, expect, it } from "vitest";
import { clearSiteParcelCacheForTests } from "./sitePreviewCache";
import { labelLooksLikeAddress, resolveSiteFrame, shouldResolveSite } from "./site";
import type { BuildingFeat } from "../types";

const building: BuildingFeat = {
  id: 1,
  ring: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
  holes: [],
  height: 9,
  use: "residential",
  source: "none",
};

describe("shouldResolveSite", () => {
  it("runs for a URL-persisted site point", () => {
    expect(shouldResolveSite(null, { lat: -37.81, lon: 145.05 })).toBe(true);
  });

  it("skips bare coordinate frames", () => {
    expect(shouldResolveSite(null, null)).toBe(false);
  });

  it("runs when the anchor label looks like an address", () => {
    expect(
      shouldResolveSite({ lat: -37.81, lon: 145.05, label: "12 Example St, Box Hill VIC 3128" }, null),
    ).toBe(true);
  });
});

describe("labelLooksLikeAddress", () => {
  it("rejects Selected frame", () => {
    expect(labelLooksLikeAddress("Selected frame")).toBe(false);
  });
});

describe("resolveSiteFrame", () => {
  beforeEach(() => {
    clearSiteParcelCacheForTests();
  });

  it("falls back to point-in-footprint when Vicmap returns no parcel", async () => {
    const frame = await resolveSiteFrame({
      anchor: { lat: -37.81, lon: 145.05 },
      center: { lat: -37.81, lon: 145.05 },
      sideM: 400,
      buildings: [building],
      fetchImpl: async () => ({ features: [] }),
    });
    expect(frame.parcel).toBeNull();
    expect(frame.siteBuildingIds).toEqual([1]);
    expect(frame.note).toMatch(/unavailable/i);
  });

  it("selects buildings from the parcel polygon", async () => {
    const frame = await resolveSiteFrame({
      anchor: { lat: -37.81, lon: 145.05 },
      center: { lat: -37.81, lon: 145.05 },
      sideM: 400,
      buildings: [building],
      fetchImpl: async () => ({
        features: [
          {
            properties: { parcel_pfi: "PFI123" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [145.05, -37.81],
                  [145.0505, -37.81],
                  [145.0505, -37.8095],
                  [145.05, -37.8095],
                  [145.05, -37.81],
                ],
              ],
            },
          },
        ],
      }),
    });
    expect(frame.parcel?.parcelPfi).toBe("PFI123");
    expect(frame.siteBuildingIds).toContain(1);
    expect(frame.note).toBeNull();
  });
});
