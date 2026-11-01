import { describe, expect, it } from "vitest";
import { clearWalkRippleAmenityCacheForTests, fetchWalkRippleAmenities } from "./walkRippleAmenityOsm";

describe("fetchWalkRippleAmenities", () => {
  it("does not retry after HTTP 429 and caches unavailable per cut", async () => {
    clearWalkRippleAmenityCacheForTests();
    let calls = 0;
    const model = { center: { lat: -37.82, lon: 145.12 }, sideM: 800, frameShape: "square" as const };
    const fetchImpl = async () => {
      calls += 1;
      return { status: 429, json: async () => ({}) };
    };
    const first = await fetchWalkRippleAmenities(model, { fetchImpl, skipCache: true });
    expect(first.status).toBe("unavailable");
    const second = await fetchWalkRippleAmenities(model, { fetchImpl });
    expect(second.status).toBe("unavailable");
    expect(calls).toBe(1);
  });
});
