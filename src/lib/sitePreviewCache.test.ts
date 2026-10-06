import { afterEach, describe, expect, it } from "vitest";
import { clearSiteParcelCacheForTests, fetchSiteParcelCached } from "./sitePreviewCache";

describe("sitePreviewCache", () => {
  afterEach(() => {
    clearSiteParcelCacheForTests();
  });

  it("reuses the parcel response for the same anchor and cut", async () => {
    clearSiteParcelCacheForTests();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { features: [] };
    };
    const anchor = { lat: -37.82, lon: 145.1 };
    const center = { lat: -37.821, lon: 145.101 };
    await fetchSiteParcelCached(anchor, center, 1000, { fetchImpl });
    await fetchSiteParcelCached(anchor, center, 1000, { fetchImpl });
    expect(calls).toBe(1);
  });
});
